// SPDX-License-Identifier: MIT
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { repositoryFiles } from "./files.mjs";
import { isInside } from "./runtime.mjs";

const parser = unified().use(remarkParse).use(remarkGfm);
function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

export function checkDocuments(
  root,
  files = repositoryFiles(root).filter(
    (file) =>
      /^[^/]+\.md$/i.test(file) ||
      /^docs\/.*\.md$/i.test(file) ||
      /^packages\/[^/]+\/(README|DEVELOPMENT|CONTRIBUTING)\.md$/i.test(file),
  ),
) {
  const errors = [];
  const documents = new Map();
  function readDocument(filename) {
    if (documents.has(filename)) return documents.get(filename);
    const source = readFileSync(filename, "utf8");
    const tree = parser.parse(source);
    const slugger = new GithubSlugger();
    const headings = new Set();
    const definitions = new Map();
    let titles = 0;
    walk(tree, (node) => {
      if (node.type === "heading") {
        headings.add(slugger.slug(toString(node)));
        if (node.depth === 1) titles++;
      }
      if (node.type === "definition")
        definitions.set(node.identifier.toLowerCase(), node.url);
      if (node.type === "html") {
        for (const match of node.value.matchAll(
          /\b(?:id|name)=["']([^"']+)["']/g,
        ))
          headings.add(match[1]);
      }
    });
    const document = { source, tree, headings, definitions, titles };
    documents.set(filename, document);
    return document;
  }
  for (const file of files) {
    const filename = resolve(root, file);
    const document = readDocument(filename);
    if (!document.titles) errors.push(`${file}: missing H1 title`);
    if (document.source.includes("\r"))
      errors.push(`${file}: expected LF line endings`);
    walk(document.tree, (node) => {
      if (
        !["link", "image", "linkReference", "imageReference"].includes(
          node.type,
        )
      )
        return;
      const url =
        node.url ?? document.definitions.get(node.identifier.toLowerCase());
      const location = `${file}:${node.position.start.line}`;
      if (!url) {
        errors.push(`${location}: undefined link reference ${node.identifier}`);
        return;
      }
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return;
      let targetPath, fragment;
      try {
        const [pathAndQuery, hash = ""] = url.split("#");
        targetPath = decodeURIComponent(pathAndQuery.split("?")[0]);
        fragment = decodeURIComponent(hash);
      } catch {
        errors.push(`${location}: invalid URL encoding ${url}`);
        return;
      }
      let target = targetPath
        ? resolve(
            targetPath.startsWith("/") ? root : dirname(filename),
            targetPath.replace(/^\//, ""),
          )
        : filename;
      if (!isInside(root, target) || !existsSync(target)) {
        errors.push(`${location}: missing local target ${url}`);
        return;
      }
      if (statSync(target).isDirectory()) {
        const readme = resolve(target, "README.md");
        if (existsSync(readme)) target = readme;
      }
      if (
        fragment &&
        extname(target).toLowerCase() === ".md" &&
        !readDocument(target).headings.has(fragment)
      ) {
        errors.push(`${location}: missing heading ${url}`);
      }
    });
  }
  return errors;
}
