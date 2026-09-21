import 'server-only';

import { loadDefaultJapaneseParser } from 'budoux';
import { Fragment } from 'react';

const parser = loadDefaultJapaneseParser();

/** Resolve phrase boundaries during static rendering without changing the title's text. */
export function TitleText({ children }: { children: string }) {
  return (
    <span className="[overflow-wrap:anywhere] [word-break:keep-all]">
      {parser.parse(children).map((phrase, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {phrase}
        </Fragment>
      ))}
    </span>
  );
}
