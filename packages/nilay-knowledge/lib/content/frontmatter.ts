import { frontmatterSchema } from './schemas';
import type { ContentFrontmatter } from './types';

export function parseFrontmatter(input: unknown, source: string): ContentFrontmatter {
  const result = frontmatterSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    const field = issue.path[0] ?? 'frontmatter';
    const expected = field === 'tags' ? 'an array of non-empty strings' : issue.message;
    throw new Error(`${source}: ${String(field)} must be ${expected}`);
  }

  const { updated, image, category, description, ...required } = result.data;
  return {
    ...required,
    ...(updated !== undefined ? { updated } : {}),
    ...(image !== undefined ? { image } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(description !== undefined ? { description } : {}),
  };
}
