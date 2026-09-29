# Renderer capabilities

`RenderedContent.capabilities` is the renderer-owned, serializable description
of optional presentation features. The server adapter passes it through to both
article and news pages, together with the HTML and table of contents.

- `mathStyles` requests the KaTeX stylesheet when an element has the `katex` class.
- `highlightStyles` requests the highlight stylesheet for the `hljs` class.
- `codeControls` selects the Markdown client boundary when an element has the
  `data-code-block` attribute.

The collector inspects the final transformed HAST, after highlighting, math, and
code-block transforms and before serialization. Trusted authored HTML participates
in the same contract. Comments, escaped examples, partial class names, and marker
text in unrelated attributes do not request features. Each render has independent
capability state; no HTML reparsing or shared mutable result is involved.

`ContentStyles` still emits server-rendered stylesheet links with React precedence,
so optional styles work without JavaScript. Plain prose, including prose describing
`data-code-block`, does not select the Markdown client enhancement component.
This does not claim a measured bundle-size or hydration-time improvement.

The metadata does not replace the client's local DOM contract. The enhancement
boundary still finds `[data-code-block]`, `[data-code-controls]`, `pre > code`, and
its diagram slots. Authored markers select the boundary, but incomplete authored
controls are still handled by the existing client checks. Copy controls, deferred
diagram loading, source-code fallback, original HTML, and accessible names remain
unchanged. Tests exercise real generated and authored slots in addition to feature
flags and server-rendered stylesheet links.
