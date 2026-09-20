import { beforeEach, expect, it } from 'vitest';

import { focusContent } from '@/lib/focus-content';

beforeEach(() => {
  document.body.innerHTML =
    '<main id="main-content" tabindex="-1"><h1>記事タイトル</h1><details><summary>詳しく読む</summary><details><summary>補足</summary><h2 id="節%">節の内容</h2></details></details></main>';
});

it('opens every enclosing disclosure before focusing a section with an encoded fragment', () => {
  focusContent(`#${encodeURIComponent('節%')}`);
  expect(document.querySelectorAll('details[open]')).toHaveLength(2);
  expect(document.getElementById('節%')).toHaveFocus();
  expect(document.getElementById('節%')?.scrollIntoView).toHaveBeenCalled();
});

it.each(['', '#missing', '#%ZZ'])('focuses the page title for an absent or invalid destination: %s', (hash) => {
  focusContent(hash);
  expect(document.querySelector('h1')).toHaveFocus();
  expect(document.querySelector('h1')).toHaveAttribute('tabindex', '-1');
  expect(document.querySelector('details')).not.toHaveAttribute('open');
});
