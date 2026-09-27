// SPDX-License-Identifier: MIT
/** Minimal element trees for bounded government pages; hidden regions are dropped. */
import { clean, words } from "../text.ts";

import { parseHtml } from "./tokenizer.ts";

export interface Element {
  readonly tag: string;
  readonly attrs: ReadonlyMap<string, string>;
  readonly children: (Element | string)[];
}

/** Descendant elements in document order, optionally filtered by tag and class. */
export function* descendants(
  node: Element,
  tag?: string,
  className?: string,
): Generator<Element> {
  for (const child of node.children) {
    if (typeof child === "string") continue;
    if (
      (tag === undefined || child.tag === tag) &&
      (className === undefined || hasClass(child, className))
    )
      yield child;
    yield* descendants(child, tag, className);
  }
}

export function first<T>(nodes: Iterable<T>): T | undefined {
  for (const node of nodes) return node;
  return undefined;
}

export function attr(node: Element, name: string): string {
  return node.attrs.get(name) ?? "";
}

export function hasClass(node: Element, className: string): boolean {
  return words(attr(node, "class")).includes(className);
}

/** Text of all descendants, joined by spaces and whitespace-collapsed. */
export function textOf(node: Element): string {
  return clean(
    node.children
      .map((child) => (typeof child === "string" ? child : textOf(child)))
      .join(" "),
  );
}

/** Parse `html`, omitting the subtrees of `hidden` elements. */
export function parseDocument(
  html: string,
  hidden: ReadonlySet<string>,
): Element {
  const root: Element = { tag: "document", attrs: new Map(), children: [] };
  const open: Element[] = [root];
  let skipped = 0;
  parseHtml(html, {
    open(tag, attrs) {
      if (skipped || hidden.has(tag)) {
        skipped += 1;
        return;
      }
      const node: Element = { tag, attrs, children: [] };
      open.at(-1)?.children.push(node);
      open.push(node);
    },
    close() {
      if (skipped) skipped -= 1;
      else if (open.length > 1) open.pop();
    },
    text(text) {
      if (!skipped) open.at(-1)?.children.push(text);
    },
  });
  return root;
}
