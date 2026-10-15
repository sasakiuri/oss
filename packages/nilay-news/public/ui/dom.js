// SPDX-License-Identifier: MIT
import { messageText } from "./time.js";

export const $ = (id) => document.getElementById(id);
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function button(text, className, action, focusKey) {
  const node = el("button", className, text);
  node.type = "button";
  if (action) node.addEventListener("click", action);
  if (focusKey) node.dataset.focus = focusKey;
  return node;
}

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function externalLink(text, url, className) {
  const href = safeUrl(url);
  const node = el(href ? "a" : "span", className, text);
  if (href) {
    node.href = href;
    node.target = "_blank";
    node.rel = "noopener noreferrer";
  }
  return node;
}

export function showNotice(message, error = false) {
  $("notice-text").textContent = messageText(message);
  $("notice").classList.toggle("error", error);
  $("notice").setAttribute("role", error ? "alert" : "status");
  $("notice").hidden = false;
}

export function hideNotice() {
  $("notice").hidden = true;
}
