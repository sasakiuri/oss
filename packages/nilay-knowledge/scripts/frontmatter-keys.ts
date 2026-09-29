import { frontmatterSchema } from '../lib/content/schemas';

const knownKeys = new Set<string>(frontmatterSchema.keyof().options);

/** Authoring policy only; namespaced custom values remain outside the runtime content contract. */
export function checkFrontmatterKeys(input: unknown, source: string): void {
  // Leave non-mapping and known-field validation to the existing runtime schema.
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return;
  const unknown = Object.keys(input)
    .filter((key) => !knownKeys.has(key) && !/^x-[a-z][a-z0-9-]*$/.test(key))
    .sort();
  if (unknown.length > 0) {
    throw new Error(
      unknown
        .map(
          (key) =>
            `${source}: unknown frontmatter key ${JSON.stringify(key)}; use a documented field or an x- extension`,
        )
        .join('\n'),
    );
  }
}
