'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import { Link } from 'lucide-react';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
}

function generateId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s-]/g, '')
    .replace(/\s+/g, '-');
}

const components: Components = {
  h1: ({ children, ...props }) => {
    const id = generateId(String(children));
    return (
      <h1 id={id} className="heading-with-anchor" {...props}>
        <a href={`#${id}`} className="heading-anchor" aria-label="この見出しへのリンク">
          <Link size={20} />
        </a>
        {children}
      </h1>
    );
  },
  h2: ({ children, ...props }) => {
    const id = generateId(String(children));
    return (
      <h2 id={id} className="heading-with-anchor" {...props}>
        <a href={`#${id}`} className="heading-anchor" aria-label="この見出しへのリンク">
          <Link size={20} />
        </a>
        {children}
      </h2>
    );
  },
  h3: ({ children, ...props }) => {
    const id = generateId(String(children));
    return (
      <h3 id={id} className="heading-with-anchor" {...props}>
        <a href={`#${id}`} className="heading-anchor" aria-label="この見出しへのリンク">
          <Link size={20} />
        </a>
        {children}
      </h3>
    );
  },
  h4: ({ children, ...props }) => {
    const id = generateId(String(children));
    return (
      <h4 id={id} className="heading-with-anchor" {...props}>
        <a href={`#${id}`} className="heading-anchor" aria-label="この見出しへのリンク">
          <Link size={20} />
        </a>
        {children}
      </h4>
    );
  },
  a: ({ href, children, ...props }) => {
    const isExternal = href?.startsWith('http');
    return (
      <a
        href={href}
        {...(isExternal && { target: '_blank', rel: 'noopener noreferrer' })}
        {...props}
      >
        {children}
      </a>
    );
  },
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeSlug, rehypeHighlight]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}
