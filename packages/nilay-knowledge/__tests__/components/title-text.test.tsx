import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TitleText } from '@/components/title-text';

vi.mock('server-only', () => ({}));

describe('TitleText', () => {
  it('adds optional phrase boundaries while preserving the heading and copied text', () => {
    const title = '猟銃・空気銃所持許可の新規取得手順';
    render(
      <h1>
        <TitleText>{title}</TitleText>
      </h1>,
    );

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe(title);
    expect(heading.querySelectorAll('wbr').length).toBeGreaterThan(0);
    expect(heading.querySelector('br')).toBeNull();
    const range = document.createRange();
    range.selectNodeContents(heading);
    expect(range.toString()).toBe(title);
  });

  it.each(['', '狩猟', '日本語と English（PDF）', '🦆とガモの見分け方', '<img src=x onerror=alert(1)> & 射撃'])(
    'preserves plain text without inserting characters or interpreting HTML: %s',
    (title) => {
      const { container } = render(<TitleText>{title}</TitleText>);
      expect(container.textContent).toBe(title);
      expect(container.querySelector('img, script')).toBeNull();
      expect(container.textContent).not.toContain('\u200b');
    },
  );
});
