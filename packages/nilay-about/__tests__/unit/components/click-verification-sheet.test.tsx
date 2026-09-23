import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  TallTargetSheet,
  type TallTargetSheetText,
} from '@/app/(standalone)/labs/click-verification/tall-target-sheet';
import { tallTargetLayout } from '@/lib/click-verification';

const text: TallTargetSheetText = {
  join: (index) => `join ${index}`,
  expected: 'expected',
  aim: 'aim',
  glue: 'glue',
  page: (index, count) => `${index + 1}/${count}`,
  reference: '50 mm',
};

// 30 MOA at 100 m.
const layout = tallTargetLayout(872.6867790758789)!;
// The assertions below reach page 3, so the layout must carry at least that many.
expect(layout.pages.length).toBeGreaterThanOrEqual(3);
const firstPage = layout.pages[0]!;
const secondPage = layout.pages[1]!;
const thirdPage = layout.pages[2]!;

describe('the printed tall target', () => {
  it('is drawn in millimetres on an A4 sheet', () => {
    const { container } = render(<TallTargetSheet layout={layout} page={firstPage} text={text} actualSize />);
    const svg = container.querySelector('svg')!;
    // One unit of the drawing is one millimetre of paper only while these three agree.
    expect(svg).toHaveAttribute('viewBox', '0 0 210 297');
    expect(svg).toHaveAttribute('width', '210mm');
    expect(svg).toHaveAttribute('height', '297mm');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries a 50 mm reference line with a tick every 10 mm', () => {
    const { container } = render(<TallTargetSheet layout={layout} page={thirdPage} text={text} actualSize />);
    const paths = [...container.querySelectorAll('path')].map((path) => path.getAttribute('d'));
    expect(paths).toContain('M 20 278 h 50');
    for (const x of [20, 30, 40, 50, 60, 70]) expect(paths).toContain(`M ${x} 276 v 4`);
  });

  it('puts the aim point, the join lines and the millimetre ticks where the layout says', () => {
    const first = render(<TallTargetSheet layout={layout} page={firstPage} text={text} actualSize />).container;
    const firstPaths = [...first.querySelectorAll('path')].map((path) => path.getAttribute('d'));
    // The aim point is 15 mm above the foot of the drawing (paper y 252); the top join line is at paper y 12.
    expect(firstPaths).toContain('M 65 252 H 145');
    expect(firstPaths).toContain('M 10 12 H 200');
    expect(firstPaths).toContain('M 105 252 h 10');
    expect(firstPaths).toContain('M 105 251 h 3');
    expect(first.textContent).toContain('join 1');
    expect(first.textContent).not.toContain('join 0');
    // The next sheet shares join line 1, 15 mm above its foot, and continues the ticks from 225 mm.
    const second = render(<TallTargetSheet layout={layout} page={secondPage} text={text} actualSize />).container;
    const secondPaths = [...second.querySelectorAll('path')].map((path) => path.getAttribute('d'));
    expect(secondPaths).toContain('M 10 252 H 200');
    expect(secondPaths).toContain('M 105 267 h 6');
    expect(second.textContent).toContain('join 1');
    expect(second.textContent).toContain('join 2');
  });

  it('prints each sheet as its own A4 page with no margin', () => {
    const css = readFileSync(
      join(process.cwd(), 'app/(standalone)/labs/click-verification/tall-target-print.module.css'),
      'utf8',
    );
    expect(css).toMatch(/@page\s*{\s*size:\s*A4 portrait;\s*margin:\s*0;\s*}/);
    expect(css).toMatch(/\.page\s*{[^}]*width:\s*210mm;[^}]*height:\s*297mm;[^}]*break-after:\s*page;/);
  });
});
