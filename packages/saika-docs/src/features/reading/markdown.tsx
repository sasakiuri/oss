// SPDX-License-Identifier: MIT
import { toString } from 'hast-util-to-string';
import Image from 'next/image';
import Link from 'next/link';
import Markdown from 'react-markdown';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkGithubBlockquoteAlert from 'remark-github-blockquote-alert';
import remarkMath from 'remark-math';

import { remarkCodeMeta } from '@/entities/document/code-meta';
import type { DocumentRecord } from '@/entities/document/model';
import { remarkDocumentLinks } from '@/entities/document/parse';
import { readServerEnv } from '@/shared/config/env';
import { site } from '@/shared/config/site';

import { CodeBlock } from './code-block';
import { DotChart } from './dot-chart';
import { MermaidChart } from './mermaid-chart';

export function DocumentMarkdown({ document }: { document: DocumentRecord }) {
  return (
    <div className="prose max-w-none">
      <Markdown
        remarkPlugins={[
          remarkGfm,
          remarkMath,
          remarkCodeMeta,
          ...(readServerEnv().DOCS_SOFT_BREAKS ? [remarkBreaks] : []),
          remarkGithubBlockquoteAlert,
          [remarkDocumentLinks, { sourcePath: document.sourcePath, sourceRef: site.sourceRef }],
        ]}
        rehypePlugins={[
          rehypeRaw,
          [
            rehypeSanitize,
            {
              ...defaultSchema,
              attributes: {
                ...defaultSchema.attributes,
                code: [['className', /^language-./, 'math-inline', 'math-display'], 'dataFilename'],
                div: [
                  ...(defaultSchema.attributes?.div ?? []),
                  ['className', 'markdown-alert', /^markdown-alert-(note|tip|important|warning|caution)$/],
                ],
                p: [...(defaultSchema.attributes?.p ?? []), ['className', 'markdown-alert-title']],
              },
            },
          ],
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: 'append',
              properties: { className: ['heading-anchor'], ariaLabel: '見出しへのリンク' },
              content: { type: 'text', value: '#' },
            },
          ],
          rehypeKatex,
          [rehypeHighlight, { detect: false, ignoreMissing: true, plainText: ['mermaid', 'dot', 'graphviz'] }],
        ]}
        remarkRehypeOptions={{ footnoteLabel: '脚注', footnoteBackLabel: '本文へ戻る' }}
        components={{
          img({ src, alt, width, height }) {
            const image = typeof src === 'string' ? src : '';
            const w = Number(width);
            const h = Number(height);
            if (image && w > 0 && h > 0)
              return <Image src={image} alt={alt ?? ''} width={w} height={h} sizes="(max-width: 768px) 100vw, 900px" />;
            // Without source dimensions, preserve the image's natural ratio and decorative empty alt.
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={image} alt={alt ?? ''} loading="lazy" decoding="async" />;
          },
          a({ node: _node, href, children, ...props }) {
            if (href?.startsWith('/'))
              return (
                <Link prefetch={false} href={href} {...props}>
                  {children}
                </Link>
              );
            const external = /^https?:\/\//.test(href ?? '');
            return (
              <a
                {...props}
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer' : undefined}
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="table-scroll" tabIndex={0} role="region" aria-label="表（横にスクロールできます）">
                <table>{children}</table>
              </div>
            );
          },
          pre({ node, children }) {
            const code = node?.children[0];
            const classes = code?.type === 'element' ? code.properties.className : [];
            const language = Array.isArray(classes)
              ? String(classes.find((name) => String(name).startsWith('language-')) ?? '').replace('language-', '')
              : '';
            const source = node ? toString(node) : '';
            return ['dot', 'graphviz'].includes(language) ? (
              <DotChart source={source} />
            ) : language === 'mermaid' ? (
              <MermaidChart source={source} />
            ) : (
              <CodeBlock
                source={source}
                language={language}
                filename={code?.type === 'element' ? String(code.properties.dataFilename ?? '') : undefined}
              >
                {children}
              </CodeBlock>
            );
          },
        }}
      >
        {document.markdown}
      </Markdown>
    </div>
  );
}
