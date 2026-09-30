import type { Element, Root, RootContent } from 'hast';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

declare module 'hast' {
  interface ElementData {
    authoredFragment?: boolean;
  }
}

export interface PublishedFragment {
  id: string;
  /** Generated headings retain section text to detect later duplicate insertion. */
  section?: string;
  repeated?: boolean;
  /** Computed for comparison, omitted when serializing the approved baseline. */
  destination?: string;
}

export type FragmentBaseline = Record<string, PublishedFragment[]>;

function text(node: Root | RootContent): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element' && node.tagName === 'img') return String(node.properties.alt ?? '');
  return 'children' in node ? node.children.map(text).join(' ') : '';
}

export function rehypeMarkAuthoredIds() {
  return (tree: Root): void => {
    visit(tree, 'element', (node) => {
      if (node.properties.id) node.data = { ...node.data, authoredFragment: true };
    });
  };
}

/** Aliases live inside their destination heading so native fragment navigation reaches the section. */
export function rehypePublishedFragments() {
  return (tree: Root, file: VFile): void => {
    const ids = new Map<string, Element>();
    const aliases: { node: Element; parent: Root | Element }[] = [];
    visit(tree, 'element', (node, _index, parent) => {
      if (node.properties.id != null) {
        const id = String(node.properties.id);
        if (!id || /[\s\u0000-\u001f\u007f]/.test(id))
          file.fail(`Invalid published fragment ID: ${JSON.stringify(id)}`, node);
        if (ids.has(id)) file.fail(`Duplicate published fragment ID: ${id}`, node);
        ids.set(id, node);
      }
      if (node.properties.dataFragmentAliasFor != null && parent && 'children' in parent) {
        aliases.push({ node, parent });
      }
    });
    for (const { node, parent } of aliases) {
      const target = ids.get(String(node.properties.dataFragmentAliasFor));
      if (
        !node.properties.id ||
        node.tagName !== 'span' ||
        node.children.length ||
        !target ||
        !/^h[1-6]$/.test(target.tagName) ||
        target === node
      ) {
        file.fail('Fragment aliases require an empty span with an ID and a canonical heading target', node);
      }
      parent.children = parent.children.filter((child) => child !== node);
      node.properties.ariaHidden = 'true';
      target.children.unshift(node);
    }
  };
}

export function collectPublishedFragments(tree: Root): PublishedFragment[] {
  const headings: Element[] = [];
  const elements: Element[] = [];
  visit(tree, 'element', (node) => {
    if (node.properties.id === 'footnote-label' || /^user-content-fn(?:ref)?-/.test(String(node.properties.id))) return;
    if (node.properties.id && (/^h[1-6]$/.test(node.tagName) || node.data?.authoredFragment)) elements.push(node);
    if (/^h[1-6]$/.test(node.tagName) && node.properties.id) headings.push(node);
  });
  const duplicates = new Map<string, number>();
  for (const heading of headings) {
    const title = text(heading).replace(/\s+/g, ' ').trim();
    duplicates.set(title, (duplicates.get(title) ?? 0) + 1);
  }
  // Sections follow the same traversal and heading boundaries as article search.
  const sections = new Map<Element, string>();
  let current: Element | undefined;
  function collect(node: Root | RootContent): void {
    if (node.type === 'element' && headings.includes(node)) {
      current = node;
      sections.set(node, '');
      return;
    }
    if (node.type === 'text' && current) sections.set(current, `${sections.get(current)} ${node.value}`);
    if ('children' in node) node.children.forEach(collect);
  }
  collect(tree);
  return elements.map((node) => {
    const title = text(node).replace(/\s+/g, ' ').trim();
    const section =
      !node.data?.authoredFragment && headings.includes(node)
        ? (sections.get(node)?.replace(/\s+/g, ' ').trim() ?? '')
        : undefined;
    const fragment: PublishedFragment = {
      id: String(node.properties.id),
      ...(section === undefined ? {} : { section, ...((duplicates.get(title) ?? 0) > 1 ? { repeated: true } : {}) }),
    };
    const heading = headings.includes(node)
      ? node
      : headings.find((item) => item.properties.id === node.properties.dataFragmentAliasFor);
    if (heading) {
      Object.defineProperty(fragment, 'destination', {
        value: sections.get(heading)?.replace(/\s+/g, ' ').trim() ?? '',
        enumerable: false,
      });
      if (!fragment.repeated && (duplicates.get(text(heading).replace(/\s+/g, ' ').trim()) ?? 0) > 1) {
        Object.defineProperty(fragment, 'repeated', { value: true, enumerable: false });
      }
    }
    return fragment;
  });
}

export function comparePublishedFragments(previous: FragmentBaseline, proposed: FragmentBaseline): string[] {
  const problems: string[] = [];
  for (const [url, fragments] of Object.entries(previous)) {
    for (const fragment of fragments) {
      const next = proposed[url]?.find(({ id }) => id === fragment.id);
      if (!next)
        problems.push(`${url}#${encodeURIComponent(fragment.id)}: published fragment removed (content${url}index.md)`);
      else if (
        fragment.section !== undefined &&
        (fragment.repeated || next.repeated) &&
        fragment.section !== (next.destination ?? next.section)
      ) {
        problems.push(
          `${url}#${encodeURIComponent(fragment.id)}: repeated heading destination changed (content${url}index.md); preserve an authored ID or review its migration`,
        );
      }
    }
  }
  return problems;
}
