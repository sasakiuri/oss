import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { JsonLd } from '@/components/json-ld';

describe('JsonLd', () => {
  it('cannot be closed early by text in the data', () => {
    const { container } = render(<JsonLd data={{ headline: '</script><script>alert(1)</script>' }} />);
    const scripts = container.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0]?.textContent ?? '')).toEqual({ headline: '</script><script>alert(1)</script>' });
  });
});
