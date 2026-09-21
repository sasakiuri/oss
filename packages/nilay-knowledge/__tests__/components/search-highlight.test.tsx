import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SearchHighlight } from '@/components/search-highlight';

describe('search highlighting', () => {
  it('normalizes length-changing characters before locating multiple matches', () => {
    const { container } = render(<SearchHighlight text="㍿・ＵＳＢ・申請書" query="株式会社 usb 申請" />);
    expect(container.textContent).toBe('株式会社・USB・申請書');
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      '株式会社',
      'USB',
      '申請',
    ]);
  });

  it('treats query metacharacters literally and renders markup as text', () => {
    const { container } = render(<SearchHighlight text={'<script>.+</script>abc'} query=".+" />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('mark')).toHaveTextContent('.+');
    expect(container.textContent).toBe('<script>.+</script>abc');
  });
});
