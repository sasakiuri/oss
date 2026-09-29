import type { RenderedContent } from '@/lib/content/types';

import { EnhancedMarkdownContent } from './markdown-enhancements';

/** Plain articles can render without the client Markdown enhancement component. */
export function MarkdownContent({
  html,
  capabilities,
  className,
}: Pick<RenderedContent, 'html' | 'capabilities'> & { className: string }) {
  if (!capabilities.codeControls) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <EnhancedMarkdownContent html={html} className={className} />;
}
