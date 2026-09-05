import { Worker } from "node:worker_threads";

export interface RegexSearchRow {
  messageGuid: string;
  text: string;
}

export interface RegexWorkerSearchOptions {
  batchSize?: number;
  batchTimeoutMs?: number;
  signal?: AbortSignal;
  totalTimeoutMs?: number;
}

interface RegexWorkerResponse {
  matches?: string[];
  requestId?: number;
  type: "invalid" | "matches" | "ready";
}

const DEFAULT_BATCH_SIZE = 128;
const DEFAULT_BATCH_TIMEOUT_MS = 250;
const DEFAULT_TOTAL_TIMEOUT_MS = 5_000;

// Keep this source static: the user-authored expression is sent as structured
// data and is never interpolated into executable worker code.
const REGEX_WORKER_SOURCE = String.raw`
  const { parentPort } = require("node:worker_threads");

  let expression;
  parentPort.on("message", (message) => {
    if (message.type === "initialize") {
      try {
        expression = new RegExp(message.query, "i");
        parentPort.postMessage({ type: "ready" });
      } catch {
        parentPort.postMessage({ type: "invalid" });
      }
      return;
    }

    if (message.type !== "batch" || !expression) {
      throw new Error("Invalid regular expression worker request");
    }

    const matches = [];
    for (const row of message.rows) {
      if (expression.test(row.text)) {
        matches.push(row.messageGuid);
      }
    }
    parentPort.postMessage({ matches, requestId: message.requestId, type: "matches" });
  });
`;

export class RegexSearchCancelledError extends Error {
  override name = "RegexSearchCancelledError";
}

export class RegexSearchTimeoutError extends Error {
  override name = "RegexSearchTimeoutError";
}

const normalizePositiveInteger = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

export const searchRegexRowsInWorker = (
  query: string,
  rows: IterableIterator<RegexSearchRow>,
  limit: number,
  options: RegexWorkerSearchOptions = {},
): Promise<string[]> => {
  const closeRows = () => {
    try {
      rows.return?.();
    } catch {
      // The worker result is authoritative; iterator cleanup is best effort.
    }
  };

  if (!query || limit <= 0) {
    closeRows();
    return Promise.resolve([]);
  }
  if (options.signal?.aborted) {
    closeRows();
    return Promise.reject(new RegexSearchCancelledError("Regular expression search was cancelled"));
  }

  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE);
  const batchTimeoutMs = normalizePositiveInteger(options.batchTimeoutMs, DEFAULT_BATCH_TIMEOUT_MS);
  const totalTimeoutMs = normalizePositiveInteger(options.totalTimeoutMs, DEFAULT_TOTAL_TIMEOUT_MS);

  return new Promise<string[]>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(REGEX_WORKER_SOURCE, {
        eval: true,
        execArgv: [],
        name: "mimessage-regex-search",
      });
    } catch (error) {
      closeRows();
      reject(new Error("Unable to start regular expression search worker", { cause: error }));
      return;
    }

    let batchTimer: NodeJS.Timeout | undefined;
    let currentRequestId = 0;
    let settled = false;
    const matches: string[] = [];
    const seenGuids = new Set<string>();

    const cleanup = () => {
      if (batchTimer) {
        clearTimeout(batchTimer);
      }
      clearTimeout(totalTimer);
      options.signal?.removeEventListener("abort", handleAbort);
      closeRows();
      void worker.terminate().catch(() => undefined);
    };
    const succeed = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(matches);
    };
    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const handleAbort = () => fail(new RegexSearchCancelledError("Regular expression search was cancelled"));
    const handleTimeout = () =>
      fail(new RegexSearchTimeoutError("Regular expression search timed out. Try a narrower pattern."));
    const totalTimer = setTimeout(handleTimeout, totalTimeoutMs);

    const sendNextBatch = () => {
      const batch: RegexSearchRow[] = [];
      try {
        while (batch.length < batchSize) {
          const next = rows.next();
          if (next.done) {
            break;
          }
          batch.push(next.value);
        }
      } catch (error) {
        fail(new Error("Unable to read regular expression search candidates", { cause: error }));
        return;
      }
      if (!batch.length) {
        succeed();
        return;
      }

      currentRequestId += 1;
      batchTimer = setTimeout(handleTimeout, batchTimeoutMs);
      try {
        worker.postMessage({ requestId: currentRequestId, rows: batch, type: "batch" });
      } catch (error) {
        fail(new Error("Unable to send regular expression search candidates", { cause: error }));
      }
    };

    options.signal?.addEventListener("abort", handleAbort, { once: true });
    worker.on("message", (message: RegexWorkerResponse) => {
      if (settled) {
        return;
      }
      if (message.type === "invalid") {
        fail(new Error("Invalid regular expression"));
        return;
      }
      if (message.type === "ready") {
        sendNextBatch();
        return;
      }
      if (message.type !== "matches" || message.requestId !== currentRequestId || !message.matches) {
        fail(new Error("Invalid regular expression search worker response"));
        return;
      }

      if (batchTimer) {
        clearTimeout(batchTimer);
        batchTimer = undefined;
      }
      for (const guid of message.matches) {
        if (!seenGuids.has(guid)) {
          seenGuids.add(guid);
          matches.push(guid);
          if (matches.length >= limit) {
            succeed();
            return;
          }
        }
      }
      sendNextBatch();
    });
    worker.once("error", (error) => fail(new Error("Regular expression search worker failed", { cause: error })));
    worker.once("exit", (code) => {
      if (!settled) {
        fail(new Error(`Regular expression search worker exited unexpectedly (${code})`));
      }
    });
    if (options.signal?.aborted) {
      handleAbort();
      return;
    }
    try {
      worker.postMessage({ query, type: "initialize" });
    } catch (error) {
      fail(new Error("Unable to initialize regular expression search worker", { cause: error }));
    }
  });
};
