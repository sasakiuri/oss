import type { Element, Root } from 'hast';
import type { Root as MarkdownRoot, RootContent as MarkdownContent } from 'mdast';

/** Keep fence filenames as metadata so highlighting receives only the language. */
export function remarkCodeMeta() {
  return (tree: MarkdownRoot): void => {
    function visit(node: MarkdownRoot | MarkdownContent): void {
      if (node.type === 'code') {
        let filename: string | undefined;
        const separator = node.lang?.indexOf(':') ?? -1;
        if (node.lang && separator > 0) {
          filename = node.lang.slice(separator + 1);
          node.lang = node.lang.slice(0, separator);
        }
        const metadata = node.meta?.match(/(?:^|\s)filename=(?:"([^"]*)"|'([^']*)'|([^\s"']+))/);
        filename = metadata?.[1] ?? metadata?.[2] ?? metadata?.[3] ?? filename;
        if (filename) {
          node.data ??= {};
          node.data.hProperties = { ...node.data.hProperties, dataFilename: filename.slice(0, 200) };
        }
      }
      if ('children' in node) node.children.forEach(visit);
    }
    visit(tree);
  };
}

/** Add progressive-enhancement targets while retaining the original code nodes. */
export function rehypeCodeBlocks() {
  return (tree: Root): void => {
    function visit(node: Root | Element): void {
      node.children = node.children.map((child) => {
        if (child.type !== 'element') return child;
        if (child.properties.dataCodeBlock) return child;
        visit(child);
        if (child.tagName !== 'pre' || child.children.length !== 1) return child;
        const code = child.children[0];
        if (code?.type !== 'element' || code.tagName !== 'code') return child;
        const classes = code.properties.className;
        const classNames = Array.isArray(classes) ? classes.map(String) : String(classes ?? '').split(/\s+/);
        if (classNames.some((name) => ['language-math', 'math-inline', 'math-display'].includes(name))) return child;
        const language =
          classNames
            .find((name) => name.startsWith('language-'))
            ?.slice(9)
            .toLowerCase() || 'text';
        const diagram = ['mermaid', 'dot', 'graphviz'].includes(language);
        const filename = code.properties.dataFilename;
        const caption: Element = {
          type: 'element',
          tagName: 'figcaption',
          properties: { className: ['code-caption'] },
          children: [
            {
              type: 'element',
              tagName: 'span',
              properties: {},
              children: [{ type: 'text', value: typeof filename === 'string' && filename ? filename : language }],
            },
            { type: 'element', tagName: 'span', properties: { dataCodeControls: true }, children: [] },
          ],
        };
        const content: Element[] = diagram
          ? [
              { type: 'element', tagName: 'div', properties: { dataDiagramTarget: true }, children: [] },
              {
                type: 'element',
                tagName: 'details',
                properties: { open: true, dataDiagramSource: true },
                children: [
                  {
                    type: 'element',
                    tagName: 'summary',
                    properties: {},
                    children: [{ type: 'text', value: '図のソース' }],
                  },
                  child,
                ],
              },
            ]
          : [child];
        return {
          type: 'element',
          tagName: 'figure',
          properties: {
            className: diagram ? ['markdown-code', 'markdown-diagram'] : ['markdown-code'],
            dataCodeBlock: true,
            dataCodeLanguage: language,
          },
          children: [caption, ...content],
        };
      });
    }
    visit(tree);
  };
}
