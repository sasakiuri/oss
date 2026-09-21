import type { Nodes, Root } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

/** Labels support formatting, but cannot introduce controls inside a summary. */
function labelText(node: Nodes): string | null {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value;
  if (node.type === 'break') return ' ';
  if (['paragraph', 'emphasis', 'strong', 'delete'].includes(node.type) && 'children' in node) {
    const text = node.children.map(labelText);
    return text.includes(null) ? null : text.join('');
  }
  return null;
}

/** One allowlist powers page rendering, search extraction and editorial lint. */
export function remarkContentDirectives(options: { lint?: boolean } = {}) {
  return (tree: Root, file: VFile): void => {
    const markdown = String(file);
    visit(tree, (node, index, parent): typeof SKIP | undefined => {
      if (!['containerDirective', 'leafDirective', 'textDirective'].includes(node.type) || !('name' in node)) return;
      // Generic directives also parse timestamps and colon-separated prose.
      // Only labelled/attributed inline forms opt into the site's directive syntax.
      const raw = markdown.slice(node.position?.start.offset, node.position?.end.offset);
      if (node.type === 'textDirective' && raw === `:${node.name}`) {
        if (parent && index !== undefined) {
          parent.children.splice(index, 1, {
            type: 'text',
            value: raw,
            position: node.position,
          });
        }
        return SKIP;
      }
      const fail = (reason: string): typeof SKIP => {
        if (options.lint) file.message(reason, node, 'knowledge-directives:invalid-directive');
        else file.fail(reason, node, 'knowledge-directives:invalid-directive');
        return SKIP;
      };
      if (node.name !== 'details' && node.name !== 'figure') {
        return fail(`Unknown directive "${node.name}". Supported directives: details, figure.`);
      }
      if (node.type !== 'containerDirective') {
        return fail(`Use :::${node.name}[label] with a body and a closing :::.`);
      }
      const allowedAttribute = node.name === 'details' ? 'open' : 'illustration';
      for (const [name, value] of Object.entries(node.attributes ?? {})) {
        if (name !== allowedAttribute) return fail(`Attribute "${name}" is not supported on ${node.name}.`);
        if (value !== '') return fail(`Use the bare boolean attribute {${name}}, without a value.`);
      }
      const label = node.children[0];
      if (label?.type !== 'paragraph' || !label.data?.directiveLabel) {
        return fail(`${node.name} requires a nonempty [label].`);
      }
      const text = labelText(label);
      if (!text?.trim()) return fail(`${node.name} requires a text label; links, images and HTML are not supported.`);
      const body = node.children.slice(1);
      if (!body.length) return fail(`${node.name} requires a body.`);

      if (node.name === 'details') {
        label.data = { ...label.data, hName: 'summary' };
        node.data = { ...node.data, hName: 'details', hProperties: { open: 'open' in (node.attributes ?? {}) } };
        return;
      }

      const paragraph = body[0];
      const image = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined;
      if (
        body.length !== 1 ||
        paragraph?.type !== 'paragraph' ||
        paragraph.children.length !== 1 ||
        (image?.type !== 'image' && image?.type !== 'imageReference') ||
        !image.alt?.trim()
      ) {
        return fail('figure requires exactly one Markdown image with nonempty alternative text.');
      }
      if ('illustration' in (node.attributes ?? {})) {
        image.data = { ...image.data, hProperties: { className: ['content-illustration'] } };
      }
      label.data = { ...label.data, hName: 'figcaption' };
      node.children = [paragraph, label];
      node.data = { ...node.data, hName: 'figure' };
      return undefined;
    });
  };
}
