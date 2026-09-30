// SPDX-License-Identifier: MIT
/** Error types whose messages are authored by this application and may be shown to users. */

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A browser edit no longer describes the current saved settings. */
export class SettingsConflictError extends UserError {
  constructor() {
    super(
      "設定が別の画面または自動停止処理で更新されました。入力内容を確認し、最新の設定を読み直してください",
    );
  }
}

/** A page belongs to an older article or clock snapshot. */
export class ArticlePageConflictError extends UserError {
  constructor() {
    super("一覧が更新されました。最初のページから読み直してください");
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
