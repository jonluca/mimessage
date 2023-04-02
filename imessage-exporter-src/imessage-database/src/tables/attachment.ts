import { Connection, RunResult, Statement } from "better-sqlite3";
import { resolve as resolvePath, sep as separator } from "path";
import { homedir } from "os";

interface Attachment {
  rowid: number;
  filename?: string;
  mimeType?: string;
  transferName?: string;
  totalBytes: number;
  hideAttachment: number;
  copiedPath?: string;
}

type MediaType = "image" | "video" | "audio" | "text" | "application" | "other" | "unknown";

function fromRow(row: any): Attachment {
  return {
    rowid: row.rowid,
    filename: row.filename ?? undefined,
    mimeType: row.mime_type ?? undefined,
    transferName: row.transfer_name ?? undefined,
    totalBytes: row.total_bytes ?? 0,
    hideAttachment: row.hide_attachment ?? 0,
    copiedPath: undefined,
  };
}

function get(db: Connection): Statement | Error {
  try {
    return db.prepare("SELECT * from attachment");
  } catch (error) {
    return error;
  }
}

function extract(attachment: RunResult): Attachment {
  if (attachment !== undefined) {
    return attachment;
  }

  return {
    rowid: -1,
    totalBytes: 0,
    hideAttachment: 0,
  };
}

function runDiagnostic(db: Connection): void {
  const statementCk = db.prepare<
    [],
    RunResult<{ numBlankCk: number }>
  >("SELECT count(rowid) FROM attachment WHERE typeof(ck_server_change_token_blob) == 'text'");
  const numBlankCk: number = statementCk.all()[0]?.numBlankCk || 0;

  const statementSr = db.prepare<
    [],
    RunResult<{ path: string }>
  >("SELECT filename FROM attachment");
  const paths = statementSr.all();

  const home = homedir();
  const missingFiles = paths.filter(({ path }) => {
    if (path === undefined) {
      return false;
    }

    return !resolvePath(path.replace("~", home)).startsWith(separator);
  }).length;

  if (numBlankCk > 0 || missingFiles > 0) {
    console.log("Missing attachment data:");
    if (missingFiles > 0) {
      console.log(`    Missing files: ${missingFiles}`);
    }
    if (numBlankCk > 0) {
      console.log(`    ck_server_change_token_blob: ${numBlankCk}`);
    }
  }
}

function mimeType(attachment: Attachment): MediaType {
  const mimeStr = attachment.mimeType?.split("/")[0];

  switch (mimeStr) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "text":
      return "text";
    case "application":
      return "application";
    case undefined:
      return "unknown";
    default:
      return "other";
  }
}

function path(attachment: Attachment): string | undefined {
  return attachment.filename;
}

function extension(attachment: Attachment): string | undefined {
  return path(attachment)?.split(".").pop();
}

function filename(attachment: Attachment): string {
  return attachment.transferName
    || attachment.filename
    || "Attachment missing name metadata!";
}