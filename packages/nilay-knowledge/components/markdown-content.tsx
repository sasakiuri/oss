import { EnhancedMarkdownContent } from './markdown-enhancements';

/** Plain articles can render without the client Markdown enhancement component. */
export function MarkdownContent({ html, className }: { html: string; className: string }) {
  if (!html.includes('data-code-block')) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <EnhancedMarkdownContent html={html} className={className} />;
}
