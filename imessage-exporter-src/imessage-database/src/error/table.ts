import { Error as SqliteError } from "better-sqlite3";

export enum TableError {
  Attachment = "Attachment",
  ChatToHandle = "ChatToHandle",
  Chat = "Chat",
  Handle = "Handle",
  Messages = "Messages",
  CannotConnect = "CannotConnect",
}

type ErrorDetails = {
  errorType: TableError;
  sqliteError?: SqliteError;
  errorMessage?: string;
};

export class TableErrorClass extends Error {
  public errorType: TableError;
  public sqliteError?: SqliteError;
  public errorMessage?: string;

  constructor(details: ErrorDetails) {
    super();
    this.errorType = details.errorType;
    this.sqliteError = details.sqliteError;
    this.errorMessage = details.errorMessage;
    this.message = this.getMessage();
  }

  private getMessage(): string {
    switch (this.errorType) {
      case TableError.Attachment:
      case TableError.ChatToHandle:
      case TableError.Chat:
      case TableError.Handle:
      case TableError.Messages:
        return `Failed to parse row: ${this.sqliteError}`;
      case TableError.CannotConnect:
        return this.errorMessage!;
    }
  }
}