// SPDX-License-Identifier: MIT
/**
 * Strict, namespace-aware XML trees for feeds, built with saxes. Malformed
 * documents, undefined entities and any document type declaration are errors.
 */
import { SaxesParser } from "saxes";

export class XmlError extends Error {}

export interface XmlElement {
  /** Local name without namespace prefix. */
  readonly name: string;
  /** Unprefixed attributes by name; namespaced ones as `{uri}local`. */
  readonly attrs: ReadonlyMap<string, string>;
  readonly content: (XmlElement | string)[];
}

export function childElements(element: XmlElement): XmlElement[] {
  return element.content.filter(
    (item): item is XmlElement => typeof item !== "string",
  );
}

/** Character data before the first child element (ElementTree's `text`). */
export function leadingText(element: XmlElement): string {
  let text = "";
  for (const item of element.content) {
    if (typeof item !== "string") break;
    text += item;
  }
  return text;
}

/** All descendant character data in document order. */
export function allText(element: XmlElement): string {
  return element.content
    .map((item) => (typeof item === "string" ? item : allText(item)))
    .join("");
}

function decode(data: Uint8Array): string {
  let label = "utf-8";
  if (data[0] === 0xfe && data[1] === 0xff) label = "utf-16be";
  else if (data[0] === 0xff && data[1] === 0xfe) label = "utf-16le";
  else {
    const head = new TextDecoder("latin1").decode(data.subarray(0, 200));
    const declared =
      /^(?:\xef\xbb\xbf)?<\?xml[ \t\r\n][^>]*?encoding[ \t\r\n]*=[ \t\r\n]*(["'])([A-Za-z][\w.-]*)\1/.exec(
        head,
      );
    if (declared?.[2]) label = declared[2];
  }
  try {
    return new TextDecoder(label, { fatal: true, ignoreBOM: false }).decode(
      data,
    );
  } catch {
    throw new XmlError("Unsupported or invalid character encoding");
  }
}

/** Parse a complete XML document from bytes, honouring a BOM or declared encoding. */
export function parseXml(data: Uint8Array): XmlElement {
  const parser = new SaxesParser({ xmlns: true, position: false });
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  const append = (text: string) => {
    const content = stack.at(-1)?.content;
    if (!content) return;
    const last = content.at(-1);
    if (typeof last === "string") content[content.length - 1] = last + text;
    else content.push(text);
  };
  parser.on("doctype", () => {
    throw new XmlError("Document type declarations are not supported");
  });
  parser.on("opentag", (tag) => {
    const attrs = new Map<string, string>();
    for (const attribute of Object.values(tag.attributes)) {
      if (attribute.prefix === "xmlns" || attribute.name === "xmlns") continue;
      attrs.set(
        attribute.uri
          ? `{${attribute.uri}}${attribute.local}`
          : attribute.local,
        attribute.value,
      );
    }
    const element: XmlElement = { name: tag.local, attrs, content: [] };
    stack.at(-1)?.content.push(element);
    root ??= element;
    stack.push(element);
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.on("text", append);
  parser.on("cdata", append);
  try {
    parser.write(decode(data)).close();
  } catch (error) {
    throw error instanceof XmlError
      ? error
      : new XmlError(error instanceof Error ? error.message : String(error));
  }
  if (!root) throw new XmlError("No root element");
  return root;
}
