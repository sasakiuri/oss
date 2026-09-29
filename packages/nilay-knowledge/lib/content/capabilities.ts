import type { Root } from 'hast';
import { visit } from 'unist-util-visit';

import type { ContentCapabilities } from './types';

/** Inspect the final HAST, including trusted authored HTML, without parsing serialized output again. */
export function collectContentCapabilities(tree: Root): ContentCapabilities {
  const capabilities = { mathStyles: false, highlightStyles: false, codeControls: false };
  visit(tree, 'element', (node) => {
    const value = node.properties.className;
    const classes = Array.isArray(value) ? value.map(String) : String(value ?? '').split(/\s+/);
    capabilities.mathStyles ||= classes.includes('katex');
    capabilities.highlightStyles ||= classes.includes('hljs');
    // Match the client boundary's attribute-presence selector, including authored empty values.
    capabilities.codeControls ||= Object.hasOwn(node.properties, 'dataCodeBlock');
  });
  return capabilities;
}
