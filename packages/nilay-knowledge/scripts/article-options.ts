import { parseArgs } from 'node:util';

export function parseArticleOptions(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      category: { type: 'string' },
      tag: { type: 'string', multiple: true },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (positionals.length > 1) throw new Error('Specify one quoted article title.');
  return { title: positionals[0], category: values.category, tags: values.tag ?? [], help: values.help ?? false };
}
