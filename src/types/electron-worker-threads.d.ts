declare module "electron-worker-threads" {
  export type ModuleThread<Methods extends Record<PropertyKey, unknown> = Record<string, unknown>> = Methods;

  export interface ThreadsWorkerOptions extends WorkerOptions {
    CORSWorkaround?: boolean;
    asar?: boolean;
    resourceLimits?: {
      codeRangeSizeMb?: number;
      maxOldGenerationSizeMb?: number;
      maxYoungGenerationSizeMb?: number;
    };
    workerData?: unknown;
  }

  export class Worker extends EventTarget {
    constructor(path: string, options?: ThreadsWorkerOptions);
    postMessage(value: unknown, transferList?: Transferable[]): void;
    terminate(): Promise<number> | void;
  }

  export function spawn<ThreadType>(worker: Worker, options?: { timeout?: number }): Promise<ThreadType>;

  export const Thread: {
    terminate(thread: ModuleThread): Promise<void>;
  };
}

declare module "electron-worker-threads/worker" {
  type WorkerFunction = (...args: any[]) => any;
  type WorkerModule = Record<PropertyKey, WorkerFunction>;

  export function expose(exposed: WorkerFunction | WorkerModule): void;
}
