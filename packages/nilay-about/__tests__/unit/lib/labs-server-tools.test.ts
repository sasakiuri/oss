import { describe, expect, it } from 'vitest';

import { extractContentText, WATCHED_PAGES } from '@/lib/course-watch';
import { parseResultsTable, readResultsId, RESULTS_ROWS_MAX, resultsViewPath, tableToText } from '@/lib/event-results';
import { compassPoint, distanceAndBearing, isStale, readRoomFragment, roomFragment } from '@/lib/location-share';
import {
  readPlanPrefill,
  readWatchFragment,
  returnStatus,
  scheduleDueAt,
  stepReturnSchedule,
  watchFragment,
  type ReturnSchedule,
} from '@/lib/return-alert';
import { manageFragment, readHookMessage, readManageFragment } from '@/lib/trap-alerts';

describe('extractContentText', () => {
  const page = `<html><body><div id="header">メニュー 12345</div>
    <div id="main"><h1>猟銃等講習会</h1><div class="box"><p>9月12日&nbsp;愛宕警察署</p></div>
    <script>var counter = 1;</script><!-- updated --><style>p{}</style></div>
    <div id="footer">フッター</div></body></html>`;

  it('reads only the content element, without scripts, styles or comments', () => {
    expect(extractContentText(page, '<div id="main">')).toBe('猟銃等講習会 9月12日 愛宕警察署');
  });

  it('returns null when the element is missing or never closes', () => {
    expect(extractContentText(page, '<div id="contents">')).toBeNull();
    expect(extractContentText('<div id="main"><p>open', '<div id="main">')).toBeNull();
  });

  it('knows where each watched page keeps its content', () => {
    for (const watched of WATCHED_PAGES) {
      expect(watched.url).toMatch(/^https:\/\//);
      expect(watched.contentStart).toMatch(/^<div id="[a-z_]+">$/);
    }
  });
});

describe('stepReturnSchedule', () => {
  const returnAt = Date.parse('2026-11-15T17:00:00+09:00');
  const minutes = (count: number) => returnAt + count * 60_000;
  const plan = (patch: Partial<ReturnSchedule> = {}): ReturnSchedule => ({
    stage: 'waiting',
    returnAt,
    graceMinutes: 30,
    overdueAlerts: 0,
    ...patch,
  });

  it('waits, reminds the owner, then alerts everyone three times an hour apart', () => {
    expect(stepReturnSchedule(plan(), minutes(-1))).toEqual({ action: null, next: plan(), dueAt: returnAt });

    const remind = stepReturnSchedule(plan(), minutes(2));
    expect(remind).toEqual({ action: 'remind-owner', next: plan({ stage: 'reminded' }), dueAt: minutes(30) });
    expect(stepReturnSchedule(remind.next, minutes(29)).action).toBeNull();

    const first = stepReturnSchedule(remind.next, minutes(31));
    expect(first).toEqual({
      action: 'alert-everyone',
      next: plan({ stage: 'overdue', overdueAlerts: 1 }),
      dueAt: minutes(90),
    });
    expect(stepReturnSchedule(first.next, minutes(60)).action).toBeNull();
    const second = stepReturnSchedule(first.next, minutes(91));
    expect(second.dueAt).toBe(minutes(150));
    const third = stepReturnSchedule(second.next, minutes(151));
    expect(third).toMatchObject({ action: 'alert-everyone', dueAt: null });
    expect(stepReturnSchedule(third.next, minutes(500))).toMatchObject({ action: null, dueAt: null });
  });

  it('goes straight to the alert without a grace period or after a late check', () => {
    expect(stepReturnSchedule(plan({ graceMinutes: 0 }), returnAt).action).toBe('alert-everyone');
    expect(stepReturnSchedule(plan(), minutes(45)).action).toBe('alert-everyone');
  });

  it('agrees with the due time it reports', () => {
    expect(scheduleDueAt(plan())).toBe(returnAt);
    expect(scheduleDueAt(plan({ stage: 'reminded' }))).toBe(minutes(30));
    expect(scheduleDueAt(plan({ stage: 'overdue', overdueAlerts: 1 }))).toBe(minutes(90));
    expect(scheduleDueAt(plan({ stage: 'overdue', overdueAlerts: 3 }))).toBeNull();
  });

  it('names the state for the page', () => {
    expect(returnStatus(plan(), minutes(-5))).toBe('before');
    expect(returnStatus(plan(), minutes(5))).toBe('grace');
    expect(returnStatus(plan(), minutes(30))).toBe('overdue');
  });
});

describe('return plan links', () => {
  const planId = 'p'.repeat(22);
  const token = 't'.repeat(43);

  it('round-trips the watch fragment and refuses anything else', () => {
    expect(readWatchFragment(watchFragment(planId, token))).toEqual({ planId, token });
    expect(readWatchFragment(`#watch=${planId}`)).toBeNull();
    expect(readWatchFragment(`#watch=${planId}.${token}x`)).toBeNull();
    expect(readWatchFragment('')).toBeNull();
  });

  it('takes a return time and note from another tool, and nothing malformed', () => {
    expect(readPlanPrefill('?returnAt=2026-11-15T17:00&note=%E5%8C%97%E5%B0%BE%E6%A0%B9')).toEqual({
      returnAt: '2026-11-15T17:00',
      note: '北尾根',
    });
    expect(readPlanPrefill('?returnAt=tomorrow')).toEqual({});
    expect([...(readPlanPrefill(`?note=${'あ'.repeat(300)}`).note ?? '')]).toHaveLength(200);
  });
});

describe('readHookMessage', () => {
  it.each([
    ['application/json', '{"message":"箱わな 1 号が作動"}', '箱わな 1 号が作動'],
    ['application/json; charset=utf-8', '{"value1":"fence voltage low"}', 'fence voltage low'],
    ['application/json', '{"message":5}', ''],
    ['application/json', 'not json', ''],
    ['application/x-www-form-urlencoded', 'message=%E4%BD%9C%E5%8B%95&x=1', '作動'],
    ['text/plain', 'line one\r\nline two\u0007', 'line one line two'],
    [null, 'ignored', ''],
  ])('reads %s', (type, body, expected) => {
    expect(readHookMessage(type, body)).toBe(expected);
  });

  it('reads the manage link, and not the trigger URL, as manage credentials', () => {
    const credentials = { hookId: 'h'.repeat(43), manageToken: 'm'.repeat(43), triggerToken: 't'.repeat(43) };
    expect(readManageFragment(`https://about.nilay.jp/labs/trap-alerts${manageFragment(credentials)}`)).toEqual(
      credentials,
    );
    expect(readManageFragment(`https://about.nilay.jp/api/labs/hooks/${credentials.triggerToken}`)).toBeNull();
  });

  it('cuts a long message at 200 characters', () => {
    expect([...readHookMessage('text/plain', 'あ'.repeat(300))]).toHaveLength(200);
  });
});

describe('parseResultsTable', () => {
  it('reads a pasted spreadsheet range and pads short rows', () => {
    const result = parseResultsTable('順位\t氏名\t点数\n1\t山田\t25\n2\t佐藤\n\n');
    expect(result).toEqual({
      ok: true,
      columns: ['順位', '氏名', '点数'],
      rows: [
        ['1', '山田', '25'],
        ['2', '佐藤', ''],
      ],
    });
  });

  it('reads CSV and round-trips through the edit text', () => {
    const result = parseResultsTable('Rank,Name\n1,"Smith, J"');
    expect(result).toMatchObject({ ok: true, rows: [['1', 'Smith, J']] });
    if (!result.ok) return;
    expect(parseResultsTable(tableToText(result.columns, result.rows))).toEqual(result);
  });

  it('reads the id from a results link or fragment', () => {
    const id = 'abcDEF123_-xyz12';
    expect(readResultsId(`https://about.nilay.jp${resultsViewPath(id)}`)).toBe(id);
    expect(readResultsId(`#${id}`)).toBe(id);
    expect(readResultsId('https://about.nilay.jp/labs/event-results/view')).toBeNull();
  });

  it('refuses rather than cuts what is over the limits', () => {
    expect(parseResultsTable('')).toEqual({ ok: false, error: 'empty' });
    expect(parseResultsTable('only a header')).toEqual({ ok: false, error: 'empty' });
    expect(parseResultsTable(`${'c\t'.repeat(10)}c\n1`)).toEqual({ ok: false, error: 'tooManyColumns' });
    expect(parseResultsTable(`h\n${'1\n'.repeat(RESULTS_ROWS_MAX + 1)}`)).toEqual({ ok: false, error: 'tooManyRows' });
    expect(parseResultsTable(`h\n${'x'.repeat(41)}`)).toEqual({ ok: false, error: 'cellTooLong' });
  });
});

describe('location share geometry', () => {
  const at = 0;
  it('gives distance and bearing between members', () => {
    const from = { latitude: 35, longitude: 139, accuracy: 5, at };
    const north = distanceAndBearing(from, { latitude: 35.009, longitude: 139, accuracy: 5, at });
    expect(north.metres).toBeCloseTo(1000.8, 0);
    expect(compassPoint(north.degrees, 'ja')).toBe('北');
    const east = distanceAndBearing(from, { latitude: 35, longitude: 139.01, accuracy: 5, at });
    expect(compassPoint(east.degrees, 'en')).toBe('E');
    expect(compassPoint(350, 'en')).toBe('N');
  });

  it('keeps only a room id in the invitation fragment', () => {
    const roomId = 'r'.repeat(22);
    expect(readRoomFragment(roomFragment(roomId))).toBe(roomId);
    expect(readRoomFragment(`#room=${roomId}&pass=x`)).toBeNull();
  });

  it('marks a position older than two minutes as stale', () => {
    expect(isStale({ latitude: 0, longitude: 0, accuracy: 0, at: 0 }, 120_000)).toBe(false);
    expect(isStale({ latitude: 0, longitude: 0, accuracy: 0, at: 0 }, 120_001)).toBe(true);
  });
});
