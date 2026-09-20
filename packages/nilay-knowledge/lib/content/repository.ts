import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';
import { JSON_SCHEMA, load } from 'js-yaml';

import { parseFrontmatter } from './frontmatter';
import { isContentSlug } from './paths';
import type { ContentSource, ContentSummary, ContentType } from './types';

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function validateSlug(slug: string): void {
  if (!isContentSlug(slug)) {
    throw new Error(`Invalid content slug: ${JSON.stringify(slug)}`);
  }
}

export function comparePublished(a: ContentSummary, b: ContentSummary): number {
  return (
    Date.parse(b.frontmatter.published) - Date.parse(a.frontmatter.published) ||
    a.type.localeCompare(b.type) ||
    a.slug.localeCompare(b.slug)
  );
}

/** Filesystem access and validation only; independent of React and Markdown rendering. */
export function createContentRepository(contentDirectory: string) {
  async function listSlugs(type: ContentType): Promise<string[]> {
    const directory = path.join(contentDirectory, type);
    const entries = await readdir(directory, { withFileTypes: true });
    const slugs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const file = await stat(path.join(directory, entry.name, 'index.md'));
            if (!file.isFile()) throw new Error(`${type}/${entry.name}/index.md must be a file`);
            validateSlug(entry.name);
            return entry.name;
          } catch (error) {
            if (isMissing(error)) return null;
            throw error;
          }
        }),
    );
    return slugs.filter((slug): slug is string => slug !== null).sort();
  }

  async function read(type: ContentType, slug: string): Promise<ContentSource | null> {
    validateSlug(slug);
    const filename = path.join(contentDirectory, type, slug, 'index.md');
    let source: string;
    try {
      source = await readFile(filename, 'utf8');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    try {
      // Keep YAML dates as text so impossible calendar values cannot be normalized before validation.
      const { data, content } = matter(source, {
        engines: { yaml: (value) => load(value, { schema: JSON_SCHEMA }) as Record<string, unknown> },
      });
      return { type, slug, frontmatter: parseFrontmatter(data, filename), content };
    } catch (error) {
      throw new Error(`Unable to parse content: ${filename}: ${String(error)}`, { cause: error });
    }
  }

  async function listSources(type: ContentType): Promise<ContentSource[]> {
    const slugs = await listSlugs(type);
    const sources = await Promise.all(
      slugs.map(async (slug) => {
        const source = await read(type, slug);
        if (!source) throw new Error(`Content disappeared during enumeration: ${type}/${slug}`);
        return source;
      }),
    );
    return sources.sort(comparePublished);
  }

  async function list(type: ContentType): Promise<ContentSummary[]> {
    return (await listSources(type)).map(({ type, slug, frontmatter }) => ({ type, slug, frontmatter }));
  }

  return { listSlugs, read, list, listSources };
}
