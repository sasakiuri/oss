// SPDX-License-Identifier: MIT
/**
 * HTML events from htmlparser2. Every start tag receives exactly one end event,
 * including void, implied and unclosed elements, so callers can keep a plain
 * stack. Text between two tags is delivered as one decoded run.
 */
import { Parser } from "htmlparser2";

interface HtmlHandler {
  open(tag: string, attrs: ReadonlyMap<string, string>): void;
  close(tag: string): void;
  text(text: string): void;
}

export function parseHtml(html: string, handler: HtmlHandler): void {
  let text = "";
  const flush = () => {
    if (text) handler.text(text);
    text = "";
  };
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        flush();
        handler.open(name, new Map(Object.entries(attribs)));
      },
      onclosetag(name) {
        flush();
        handler.close(name);
      },
      ontext(data) {
        text += data;
      },
      // Comments and declarations still separate text runs.
      oncomment: flush,
      onprocessinginstruction: flush,
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  flush();
}
