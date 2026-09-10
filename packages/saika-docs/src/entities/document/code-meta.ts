// SPDX-License-Identifier: MIT
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

export function remarkCodeMeta() {
  return (tree: Root) => {
    visit(tree, 'code', (node) => {
      const [language, ...parts] = (node.lang ?? '').split(':');
      const filename = parts.join(':') || node.meta?.match(/(?:^|\s)filename="([^"]+)"/)?.[1];
      if (language) node.lang = language;
      if (filename)
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, 'data-filename': filename.slice(0, 200) },
        };
    });
  };
}
