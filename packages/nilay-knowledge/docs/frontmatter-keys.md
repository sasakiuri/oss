# Frontmatter authoring keys

<!-- cspell:ignore udpated -->

`npm run lint:metadata --workspace=@sasakiuri/nilay-knowledge` runs the normal
metadata validation plus a top-level key check. Unknown keys are errors: the CLI
prints the source filename and exact quoted key and exits with status 1. Several
unknown keys in the same file are reported in sorted order. Validation may stop
at the first failing file; the output is not a complete corpus-wide error report.
The command never rewrites a key, date, value, or review record.

The supported keys are derived from the same Zod schema as runtime validation:
`title`, `description`, `published`, `tags`, `category`, `updated`, `image`, and
`review`. Optional-field spelling mistakes such as `udpated` fail authoring lint.
Existing type, date, tag, category, and nested review/source rules still apply.

## Compatibility and extensions

Runtime parsing intentionally continues to strip unknown top-level fields.
The repository's optional `validateFrontmatter` callback lets authoring tools
inspect the original YAML mapping before that stripping, without duplicating
filesystem enumeration or YAML parsing. Ordinary page/source reads do not enable
this authoring policy. The taxonomy report also retains its existing read behavior.

Intentional custom fields must use a lowercase namespaced name matching
`x-[a-z][a-z0-9-]*`, such as `x-editorial-owner` or `x-build-data`. These values are
accepted by authoring lint but remain outside the runtime content contract and
are stripped from returned frontmatter. Renaming a legacy custom field into this
namespace is an explicit author edit; the tool does not migrate it automatically.
A field intended to affect pages must instead be added to the schema and its
consumers, with appropriate tests and documentation. The namespace is not a way
to bypass validation of supported fields or nested review/source records.

## Pre-enforcement inventory

The committed corpus at `70c254d4a7b6e90ed8ae2ce2c3920950531207ab` was inspected
using the repository's gray-matter/YAML JSON schema configuration before enabling
lint failures. All 175 entries used only supported top-level keys; no existing
extension, misspelled key, or metadata migration was found.

| Key         | Articles (18 files) | News (157 files) |
| ----------- | ------------------: | ---------------: |
| title       |                  18 |              157 |
| description |                  18 |               57 |
| published   |                  18 |              157 |
| tags        |                  18 |              157 |
| category    |                  18 |                0 |
| updated     |                  10 |                4 |
| image       |                   2 |                0 |
| review      |                   2 |               57 |

These counts document that baseline, not a quota for future content. To check a
separate authoring tree without editing the committed files, pass its directory:

```bash
npm run lint:metadata --workspace=@sasakiuri/nilay-knowledge -- --content-dir /path/to/content
```

The directory has the usual `articles` and `news` collections. An omitted option
uses the package's own content directory, independent of the caller's directory.
Both helper tests and real CLI subprocess tests cover failures, allowed extensions,
ordinary metadata, exact input preservation, and runtime compatibility.
