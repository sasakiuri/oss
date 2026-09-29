# Published content asset paths

`lib/content/asset-path.ts` defines a dependency-free logical path contract shared
by HTTP serving, PDF reference discovery, PDF search-destination validation, and
image-dimension resolution. It is safe to import in browser validation code.
Filesystem existence, regular-file checks, realpath confinement, and symlink
handling remain in the Node-only consumers; a valid URL is not proof a file exists.

Every logical segment must be nonempty, must not begin with a dot, and must not
contain a slash, backslash, ASCII control character, or DEL. This retains the
public route's dotfile boundary and applies the search validator's control-character
restriction consistently. It does not expose previously hidden files.

The HTTP route passes its already-decoded Next.js parameters directly to
`isPublishableContentPath`. It must never decode them again. Encoded URL consumers
strip query strings and fragments, then use `decodeContentAssetPathname`, which
decodes each segment exactly once. Malformed percent encoding throws; logically
unpublished paths return `null`. Callers retain their own error policies.
For example, a real file named `literal%2Fname.pdf` has the URL filename
`literal%252Fname.pdf`; it is not a nested path. A URL containing `a%2Fb.pdf`
decodes to a separator inside one logical segment and is rejected.

A referenced unpublished PDF fails publication with its source collection/slug
and original asset reference. The extractor retains decoded segments internally
rather than decoding its canonical URL a second time. Missing or corrupt PDFs
still fail. Genuinely missing ordinary images retain their browser fallback;
unpublished paths and invalid filesystem structures are not missing-image cases.

The PDF search schema retains its additional collection and page-fragment rules.
MIME types, HTTP cache/range handling, and Markdown relative-URL resolution are
unchanged. The tests cover actual local images, hidden paths, encoded separators,
Unicode, spaces, literal percent sequences, and escaping symlinks. A real PDF
fixture is extracted, destination-validated, and retrieved through the HTTP helper,
with its returned bytes compared to the authored file.
