import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

import { MarkdownContent } from '@/components/markdown-content';
import { renderContent } from '@/lib/content/render';
import { renderDiagram } from '@/lib/diagrams';

vi.mock('@/lib/diagrams', () => ({ renderDiagram: vi.fn() }));

beforeEach(() => {
  vi.mocked(renderDiagram).mockReset();
});

async function markdown(content: string) {
  return renderContent({
    type: 'articles',
    slug: 'example',
    frontmatter: { title: 'Example', published: '2026-01-01', tags: [] },
    content,
  });
}

it('copies exact source rather than highlighted markup and rebinds controls when content changes', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const source = 'const value = "<hello>";\n\tconsole.log(value);\n';
  const html = await markdown(`\`\`\`ts:example.ts\n${source}\`\`\``);
  const { rerender } = render(<MarkdownContent {...html} className="prose" />);
  fireEvent.click(screen.getByRole('button', { name: 'example.tsのコードをコピー' }));
  expect(await screen.findByRole('status')).toHaveTextContent('コピーしました');
  expect(writeText).toHaveBeenCalledWith(source);

  const nextHtml = await markdown('```text:second.txt\nsecond\n```');
  rerender(<MarkdownContent {...nextHtml} className="prose" />);
  fireEvent.click(screen.getByRole('button', { name: 'second.txtのコードをコピー' }));
  await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('second\n'));
  expect(screen.queryByRole('button', { name: 'example.tsのコードをコピー' })).not.toBeInTheDocument();
  expect(renderDiagram).not.toHaveBeenCalled();
});

it('reports clipboard rejection and leaves code available to select manually', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
  });
  render(<MarkdownContent {...await markdown('```text\noriginal source\n```')} className="prose" />);
  fireEvent.click(screen.getByRole('button', { name: 'textのコードをコピー' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('コピーできませんでした'));
  expect(screen.getByText('original source')).toBeInTheDocument();
});

it('preserves source in server HTML and displays diagram failures explicitly', async () => {
  const html = await markdown('```mermaid\ninvalid syntax\n```');
  const serverHtml = renderToStaticMarkup(<MarkdownContent {...html} className="prose" />);
  const document = new DOMParser().parseFromString(serverHtml, 'text/html');
  expect(document.querySelector('[data-diagram-source]')?.hasAttribute('open')).toBe(true);
  expect(serverHtml).toContain('invalid syntax');
  expect(serverHtml).not.toContain('<button');
  vi.mocked(renderDiagram).mockRejectedValue(new Error('図を表示できませんでした。'));
  render(<MarkdownContent {...html} className="prose" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('図のソースを確認してください');
  expect(screen.getByText('図のソース').parentElement).toHaveAttribute('open');
});

it('renders plain Markdown as static readable markup without enhancement controls', async () => {
  const html = await markdown('本文だけの記事です。');
  const { container } = render(<MarkdownContent {...html} className="prose" />);
  expect(container.firstElementChild).toHaveClass('prose');
  expect(screen.getByText('本文だけの記事です。')).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(renderDiagram).not.toHaveBeenCalled();
});

it('uses the explicit capability instead of literal marker text to select the client boundary', async () => {
  const content = await markdown('Implementation notes mention `data-code-block` and `data-code-controls`.');
  expect(content.html).toContain('data-code-block');
  expect(content.capabilities.codeControls).toBe(false);
  const output = MarkdownContent({ ...content, className: 'prose' });
  expect(output.type).toBe('div');
  render(output);
  expect(screen.getByText('data-code-block')).toBeVisible();
  expect(renderDiagram).not.toHaveBeenCalled();
});

it('hydrates authored enhancement slots without changing the local selector contract', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const content = await markdown(
    '<figure data-code-block="authored" data-code-language="text"><figcaption><span>Authored</span><span data-code-controls></span></figcaption><pre><code>Original source</code></pre></figure>',
  );
  expect(content.capabilities.codeControls).toBe(true);
  const { container } = render(<MarkdownContent {...content} className="prose" />);
  expect(container.querySelectorAll('[data-code-block]')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Authoredのコードをコピー' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('Original source'));
  expect(renderDiagram).not.toHaveBeenCalled();
});
