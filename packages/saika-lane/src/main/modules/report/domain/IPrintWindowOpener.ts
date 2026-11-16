// SPDX-License-Identifier: MIT

/** Shows a session's score sheet for printing, or prints it directly to the saved printer. */
export interface IPrintWindowOpener {
  open(sessionId: string): Promise<void>;
}
