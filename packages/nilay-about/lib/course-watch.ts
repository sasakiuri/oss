/**
 * Watching official course schedule pages for changes. Only the fact that a page changed is
 * reported; its text is not copied, and the notification links to the page itself.
 */

export interface WatchedPage {
  id: string;
  prefecture: { ja: string; en: string };
  /** The publisher's name, as the page's site policy asks links to state it. */
  publisher: { ja: string; en: string };
  title: { ja: string; en: string };
  url: string;
  /** The opening tag of the element that holds the page's own content. */
  contentStart: string;
  /** The site policy consulted, and what it says about links and reuse. */
  policyUrl: string;
  checkedOn: string;
}

/**
 * Pages whose site allows it: no robots.txt rule against them (neither site publishes one) and a
 * site policy that neither forbids automated access nor restricts links. Each is read twice a day.
 */
export const WATCHED_PAGES: readonly WatchedPage[] = [
  {
    id: 'tokyo-police-course',
    prefecture: { ja: '東京都', en: 'Tokyo' },
    publisher: { ja: '警視庁ホームページ', en: 'Tokyo Metropolitan Police Department website' },
    title: {
      ja: '猟銃等講習会の日程（初心者・経験者・年少射撃資格講習）',
      en: 'Firearms course dates (beginner, renewal, junior)',
    },
    url: 'https://www.keishicho.metro.tokyo.lg.jp/about_mpd/welcome/event_koshu/koshu/koshukai.html',
    contentStart: '<div id="main">',
    policyUrl: 'https://www.keishicho.metro.tokyo.lg.jp/about/kenri_link.html',
    checkedOn: '2026-09-24',
  },
  {
    id: 'saitama-police-beginner-course',
    prefecture: { ja: '埼玉県', en: 'Saitama' },
    publisher: { ja: '埼玉県警察', en: 'Saitama Prefectural Police' },
    title: { ja: '講習会開催のお知らせ（猟銃等・初心者講習）', en: 'Beginner firearms course dates' },
    url: 'https://www.police.pref.saitama.lg.jp/c0050/shinse/ju-kousyu1.html',
    contentStart: '<div id="tmp_contents">',
    policyUrl: 'https://www.police.pref.saitama.lg.jp/riyokiyaku.html',
    checkedOn: '2026-09-24',
  },
];

export const WATCHED_PAGE_IDS = WATCHED_PAGES.map((page) => page.id) as [string, ...string[]];

/**
 * The visible text of the element that opens with `contentStart`, found by balancing `<div>` tags,
 * with scripts, styles and comments removed and whitespace collapsed. Headers, footers and menus
 * outside it are left out, so a change to the site's navigation is not reported as a new schedule.
 * Returns null when the element is missing, which the job reports as an error rather than a change.
 */
export function extractContentText(html: string, contentStart: string): string | null {
  const start = html.indexOf(contentStart);
  if (start < 0) return null;
  const tag = /<(\/?)div\b[^>]*>/gi;
  tag.lastIndex = start + contentStart.length;
  let depth = 1;
  let end = -1;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) {
      end = match.index;
      break;
    }
  }
  if (end < 0) return null;
  const text = html
    .slice(start + contentStart.length, end)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '' ? null : text;
}
