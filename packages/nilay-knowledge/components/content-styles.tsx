/* React's precedence hoists these optional server-rendered stylesheets and waits for them before display. */
/* eslint-disable @next/next/no-css-tags */

/** Load optional styles in server HTML, including when JavaScript is disabled. */
export function ContentStyles({ html }: { html: string }) {
  const classes = new Set<string>();
  // Match whole tags and quoted attribute values; escaped code examples are plain text.
  for (const [tag] of html.matchAll(/<!--[\s\S]*?-->|<[a-z][\w:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    if (tag.startsWith('<!--')) continue;
    // The Markdown renderer serializes attribute values with double quotes.
    for (const attribute of tag.matchAll(/\s([^\s"'<>/=]+)(?:="([^"]*)")?/g)) {
      if (attribute[1] === 'class') {
        for (const name of (attribute[2] ?? '').split(/\s+/)) classes.add(name);
      }
    }
  }

  return (
    <>
      {classes.has('katex') && <link rel="stylesheet" href="/content-styles/katex.min.css" precedence="content" />}
      {classes.has('hljs') && <link rel="stylesheet" href="/content-styles/github-dark.css" precedence="content" />}
    </>
  );
}
