/* React's precedence hoists these optional server-rendered stylesheets and waits for them before display. */
/* eslint-disable @next/next/no-css-tags */
import type { ContentCapabilities } from '@/lib/content/types';

/** Load optional styles in server HTML, including when JavaScript is disabled. */
export function ContentStyles({ capabilities }: { capabilities: ContentCapabilities }) {
  return (
    <>
      {capabilities.mathStyles && <link rel="stylesheet" href="/content-styles/katex.min.css" precedence="content" />}
      {capabilities.highlightStyles && (
        <link rel="stylesheet" href="/content-styles/github-dark.css" precedence="content" />
      )}
    </>
  );
}
