// SPDX-License-Identifier: MIT
import { model } from "./model.js";

export async function api(path, body) {
  const options = { credentials: "same-origin", cache: "no-store" };
  if (path === "/api/state" && body === undefined && model.stateEtag) {
    options.headers = { "If-None-Match": model.stateEtag };
  }
  if (body !== undefined) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  if (path === "/api/state" && response.status === 304 && model.serverState) {
    model.receivedStateEtag = model.stateEtag;
    return model.serverState;
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("サーバーからの応答を読み取れませんでした。");
  }
  if (!response.ok) {
    const error = new Error(
      data.error || `処理に失敗しました（${response.status}）。`,
    );
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  if (path === "/api/state") {
    model.receivedStateEtag = response.headers.get("ETag");
  }
  return data;
}
