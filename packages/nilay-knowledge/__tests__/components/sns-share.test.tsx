import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SnsShare } from '@/components/sns-share';
import { siteConfig } from '@/lib/config';

describe('SnsShare accessibility', () => {
  it('hides all share links from keyboard and accessibility navigation while collapsed', () => {
    render(<SnsShare />);
    const trigger = screen.getByRole('button', { name: 'SNSで共有' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('exposes named native share links after the trigger in keyboard order', async () => {
    render(<SnsShare title="共有する記事 & 資料" slug="articles/example" />);
    const trigger = screen.getByRole('button', { name: 'SNSで共有' });
    trigger.focus();
    await act(async () => fireEvent.click(trigger));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const group = screen.getByRole('dialog', { name: '共有先' });
    const links = within(group).getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(trigger.compareDocumentPosition(links[0]!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(trigger).toHaveAttribute('aria-controls', group.id);
    expect(trigger).toHaveFocus();
    for (const link of links) {
      expect(link).toHaveAccessibleName(/で共有（新しいタブで開く）/);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    const twitter = new URL(
      within(group)
        .getByRole('link', { name: /^Twitter/ })
        .getAttribute('href')!,
    );
    expect(twitter.searchParams.get('text')).toBe(`共有する記事 & 資料 : ${siteConfig.title}`);
    expect(twitter.searchParams.get('url')).toBe(`${siteConfig.siteUrl}/articles/example`);
  });

  it('dismisses with Escape from a share link and restores focus to the disclosure trigger', async () => {
    render(<SnsShare />);
    const trigger = screen.getByRole('button', { name: 'SNSで共有' });
    await act(async () => fireEvent.click(trigger));
    const link = screen.getByRole('link', { name: /^LINE/ });
    link.focus();
    fireEvent.keyDown(link, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('stays open when focus moves between share links and closes when focus leaves', async () => {
    render(
      <>
        <SnsShare />
        <button>次の操作</button>
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'SNSで共有' });
    await act(async () => fireEvent.click(trigger));
    screen.getByRole('link', { name: /^Twitter/ }).focus();
    screen.getByRole('link', { name: /^LINE/ }).focus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const next = screen.getByRole('button', { name: '次の操作' });
    act(() => next.focus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(next).toHaveFocus();
  });

  it('dismisses on an outside pointer press without leaving focus inside the hidden panel', async () => {
    render(
      <>
        <SnsShare />
        <p>共有先の外側</p>
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'SNSで共有' });
    await act(async () => fireEvent.click(trigger));
    const link = screen.getByRole('link', { name: /^Twitter/ });
    link.focus();
    fireEvent.pointerDown(link);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const outside = screen.getByText('共有先の外側');
    fireEvent.pointerDown(outside);
    fireEvent.click(outside);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
