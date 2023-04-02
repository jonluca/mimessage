import { CustomError } from "ts-custom-error";

export class InvalidOptionsError extends CustomError {
  public constructor(public readonly message: string) {
    super(`Invalid options!\n${message}`);
  }
}

export class DiskError extends CustomError {
  public constructor(public readonly error: Error) {
    super(`${error}`);
  }
}

export class DatabaseError extends CustomError {
  public constructor(public readonly error: Error) {
    super(`${error}`);
  }
}

export type RuntimeError = InvalidOptionsError | DiskError | DatabaseError;