// SPDX-License-Identifier: MIT
/** Error types whose messages are authored by this application and may be shown to users. */

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A missing article or source; the HTTP boundary maps it to 404. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** A deadline elapsed; the operation's later steps are abandoned. */
export class DeadlineError extends Error {
  constructor() {
    super("Operation deadline exceeded");
    this.name = "DeadlineError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
