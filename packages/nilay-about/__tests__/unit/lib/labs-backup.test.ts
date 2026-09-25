import { describe, expect, it } from 'vitest';

import {
  BACKUP_FORMAT,
  BACKUP_MAX_BYTES,
  BACKUP_VERSION,
  decodeBase64,
  encodeBase64,
  MAP_CHUNK_BYTES,
  estimateMapBytes,
  estimatePhotoBytes,
  headerLine,
  mapLines,
  photoLine,
  planBackup,
  planItems,
  readLines,
  type BackupHeader,
  type ImportRules,
} from '@/lib/labs-backup';
import type { HunterMapSetup, SavedMapImage } from '@/lib/schemas/hunter-map';
import { PHOTO_MAX_BYTES, PHOTOS_PER_RECORD_MAX, type SavedPhoto } from '@/lib/schemas/photos';

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

const photo = (id: string, overrides: Partial<SavedPhoto> = {}): SavedPhoto => ({
  id,
  tool: 'hunting-log',
  ownerId: 'outing-1',
  type: 'image/jpeg',
  data: bytes(0xff, 0xd8, 0xff),
  width: 4,
  height: 3,
  addedAt: '2026-09-24T01:02:03.000Z',
  ...overrides,
});

const image = (id: string): SavedMapImage => ({
  id,
  data: bytes(1, 2, 3),
  type: 'image/png',
  name: `${id}.png`,
  width: 8,
  height: 6,
});
const setup = (id: string): HunterMapSetup => ({
  id,
  name: id,
  fiscalYear: 2025,
  points: [],
  model: 'affine',
  projection: 'transverse-mercator',
  zones: [],
});

/**
 * Rules for a Labs with two stores that take `{ ok: true }`: `log-key`, the records of hunting-log,
 * which keeps photos and lists its record ids in `records`, and `other-key`, of a tool without photos.
 * Every picture decodes unless it is one byte long.
 */
const accepted = (value: unknown) => (value as { state?: { ok?: unknown } } | null)?.state?.ok === true;
const rules: ImportRules = {
  accepts: (key, value) => (key === 'log-key' || key === 'other-key' ? accepted(value) : undefined),
  photoRecords: (tool) =>
    tool === 'hunting-log' || tool === 'gibier-record'
      ? {
          key: 'log-key',
          ids: (value) => new Set((value as { state: { records?: string[] } }).state.records ?? []),
          // A tool of its own limit, as the capture record keeps four for its printed sheet.
          maxPerRecord: tool === 'gibier-record' ? 4 : PHOTOS_PER_RECORD_MAX,
        }
      : undefined,
  pictureDecodes: async (data) => data.byteLength !== 1,
};
const log = (...records: string[]) => ({ state: { ok: true, records }, version: 0 });

type Header = Omit<BackupHeader, 'format' | 'version'>;
const header = (overrides: Partial<Header> = {}): Header => ({
  exportedAt: '2026-09-24T00:00:00.000Z',
  localStorage: { 'log-key': log('outing-1') },
  hunterMap: { status: 'saved', maps: 1, activeId: 'map-1' },
  photos: { 'hunting-log': 2 },
  ...overrides,
});
/** A map's lines as one piece of text: the details line and its chunks. */
const mapLine = (map: HunterMapSetup, picture: SavedMapImage) => [...mapLines(map, picture)].join('');
const standardLines = () => [mapLine(setup('map-1'), image('map-1')), photoLine(photo('p1')), photoLine(photo('p2'))];

const fileOf = (head: Header, lines: string[] = standardLines()) => new Blob([headerLine(head), ...lines]);
const planFile = (file: Blob) => planBackup(readLines(file), rules, file.size);

async function plan(head: Header = header(), lines?: string[]) {
  const result = await planFile(fileOf(head, lines));
  if (!result.ok) throw new Error(result.error);
  return result.plan;
}

describe('base64', () => {
  it('round-trips every byte value, and a buffer larger than one slice', () => {
    const all = new Uint8Array(256).map((_, index) => index);
    expect(new Uint8Array(decodeBase64(encodeBase64(all.buffer))!)).toEqual(all);
    const large = new Uint8Array(100_000).map((_, index) => index % 251);
    expect(new Uint8Array(decodeBase64(encodeBase64(large.buffer))!)).toEqual(large);
  });

  it('reads nothing from text that is not base64', () => {
    expect(decodeBase64('***')).toBeNull();
  });
});

describe('the file', () => {
  it('starts with a header naming the format and version, then one line per map and photo', async () => {
    const lines: string[] = [];
    for await (const line of readLines(fileOf(header()))) lines.push(line);
    expect(lines).toHaveLength(5);
    expect(JSON.parse(lines[0]!)).toMatchObject({ format: BACKUP_FORMAT, version: BACKUP_VERSION });
    expect(JSON.parse(lines[1]!)).toMatchObject({ kind: 'map', image: { id: 'map-1', bytes: 3 }, chunks: 1 });
    expect(JSON.parse(lines[2]!)).toEqual({ kind: 'map-chunk', data: 'AQID' });
    expect(JSON.parse(lines[3]!)).toMatchObject({ kind: 'photo', photo: { id: 'p1', data: '/9j/' } });
  });

  it('reads lines split across slices, and text in more than one byte per character', async () => {
    const file = new Blob(['{"a":"日本語"}\n', '{"b":2}\n', '{"c":3}']);
    const lines: string[] = [];
    for await (const line of readLines(file, 5)) lines.push(line);
    expect(lines).toEqual(['{"a":"日本語"}', '{"b":2}', '{"c":3}']);
  });

  it('estimates the lines of a photo and a map to within a few bytes of their real size, never under', () => {
    const value = photo('p1', { data: new ArrayBuffer(3000) });
    const real = new TextEncoder().encode(photoLine(value)).length;
    expect(estimatePhotoBytes(value)).toBeGreaterThanOrEqual(real);
    expect(estimatePhotoBytes(value) - real).toBeLessThan(100);
    const big = { ...image('map-1'), data: new ArrayBuffer(MAP_CHUNK_BYTES * 2 + 5) };
    const realMap = new TextEncoder().encode(mapLine(setup('map-1'), big)).length;
    expect(estimateMapBytes(setup('map-1'), big)).toBeGreaterThanOrEqual(realMap);
    expect(estimateMapBytes(setup('map-1'), big) - realMap).toBeLessThan(1000);
  });

  it('writes a large map picture as lines of at most one chunk, none longer than a photo line', () => {
    const bytes = new Uint8Array(MAP_CHUNK_BYTES * 2 + 5).map((_, index) => index % 251);
    const lines = [...mapLines(setup('map-1'), { ...image('map-1'), data: bytes.buffer })];
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[0]!)).toMatchObject({ kind: 'map', image: { bytes: bytes.length }, chunks: 3 });
    for (const line of lines.slice(1)) expect(line.length).toBeLessThan(Math.ceil(MAP_CHUNK_BYTES / 3) * 4 + 64);
  });
});

describe('planBackup', () => {
  it('plans every part of a file it can read back, holding no picture', async () => {
    const result = await plan();
    expect(result.storage).toEqual([{ key: 'log-key', value: log('outing-1') }]);
    expect(result.hunterMap).toEqual({ action: 'replace', setups: [setup('map-1')], activeId: 'map-1' });
    expect(result.photos).toEqual([{ tool: 'hunting-log', count: 2 }]);
    expect(result.rejected).toEqual([]);
    expect(result.notIncluded).toEqual([]);
  });

  it('refuses a file that is not a backup of this version', async () => {
    const read = (text: string) => planFile(new Blob([text]));
    expect(await read('')).toEqual({ ok: false, error: 'not-json' });
    expect(await read('{')).toEqual({ ok: false, error: 'not-json' });
    expect(await read('{"format":"other"}')).toEqual({ ok: false, error: 'not-backup' });
    expect(await read(headerLine(header()).replace(`"version":${BACKUP_VERSION}`, '"version":1'))).toEqual({
      ok: false,
      error: 'not-backup',
    });
    expect(await read(`${headerLine(header())}{"kind":"unknown"}\n`)).toEqual({ ok: false, error: 'not-backup' });
  });

  it('leaves out a value its store refuses and a key no store uses, and the photos of refused records', async () => {
    const result = await plan(
      header({ localStorage: { 'log-key': { state: { ok: false }, version: 0 }, 'someone-else': {} } }),
    );
    expect(result.storage).toEqual([]);
    expect(result.photos).toEqual([]);
    expect(result.rejected).toEqual([
      { part: { kind: 'storage', key: 'log-key' }, reason: 'invalid' },
      { part: { kind: 'storage', key: 'someone-else' }, reason: 'unknown' },
      { part: { kind: 'photos', tool: 'hunting-log' }, reason: 'records-rejected' },
    ]);
  });

  it('refuses photos of a record not restored with them, and for a tool that keeps none', async () => {
    const orphan = await plan(header(), [
      mapLine(setup('map-1'), image('map-1')),
      photoLine(photo('p1')),
      photoLine(photo('p2', { ownerId: 'gone' })),
    ]);
    expect(orphan.rejected).toEqual([{ part: { kind: 'photos', tool: 'hunting-log' }, reason: 'invalid' }]);
    const unknown = await plan(header({ photos: { 'trap-tag': 0 } }), [mapLine(setup('map-1'), image('map-1'))]);
    expect(unknown.rejected).toEqual([{ part: { kind: 'photos', tool: 'trap-tag' }, reason: 'unknown' }]);
  });

  it('refuses a tool’s photos when the file is cut short within them, or has more than the header says', async () => {
    const short = await plan(header(), standardLines().slice(0, 2));
    expect(short.rejected).toEqual([{ part: { kind: 'photos', tool: 'hunting-log' }, reason: 'invalid' }]);
    const extra = await plan(header(), [...standardLines(), photoLine(photo('p3'))]);
    expect(extra.rejected).toEqual([{ part: { kind: 'photos', tool: 'hunting-log' }, reason: 'invalid' }]);
  });

  it('refuses photos with a repeated id, over the size limit, that do not decode, or too many on a record', async () => {
    const lines = (...photos: SavedPhoto[]) => [mapLine(setup('map-1'), image('map-1')), ...photos.map(photoLine)];
    const check = async (...photos: SavedPhoto[]) =>
      (await plan(header({ photos: { 'hunting-log': photos.length } }), lines(...photos))).rejected;
    const refused = [{ part: { kind: 'photos', tool: 'hunting-log' }, reason: 'invalid' }];
    expect(await check(photo('same'), photo('same'))).toEqual(refused);
    expect(await check(photo('big', { data: new ArrayBuffer(PHOTO_MAX_BYTES + 1) }))).toEqual(refused);
    expect(await check(photo('broken', { data: bytes(1) }))).toEqual(refused);
    expect(await check(photo('restore:x:y'))).toEqual(refused);
    expect(await check(...Array.from({ length: PHOTOS_PER_RECORD_MAX + 1 }, (_, index) => photo(`p${index}`)))).toEqual(
      refused,
    );
    // A photo over 4 MB is encoded and decoded here, which is slow when the whole suite runs.
  }, 30_000);

  it('plans to clear the photos of records restored with none, and leaves photos alone when the file has none read', async () => {
    const lines = [mapLine(setup('map-1'), image('map-1'))];
    expect((await plan(header({ photos: { 'hunting-log': 0 } }), lines)).photos).toEqual([
      { tool: 'hunting-log', count: 0 },
    ]);
    const unread = await plan(header({ photos: null }), lines);
    expect(unread.photos).toEqual([]);
    expect(unread.notIncluded).toEqual(['photos']);
    expect((await plan(header({ photos: {} }), lines)).rejected).toEqual([]);
  });

  it('plans to clear the maps when the file had none, and leaves them alone when the export could not read them', async () => {
    const photos = standardLines().slice(1);
    expect((await plan(header({ hunterMap: { status: 'empty' } }), photos)).hunterMap).toEqual({ action: 'clear' });
    const unread = await plan(header({ hunterMap: { status: 'not-included' } }), photos);
    expect(unread.hunterMap).toBeNull();
    expect(unread.notIncluded).toEqual(['hunter-map']);
    expect(unread.rejected).toEqual([]);
  });

  it('refuses the maps when one does not read, repeats an id, is missing, or the open one is not among them', async () => {
    const photos = standardLines().slice(1);
    const refused = [{ part: { kind: 'hunter-map' }, reason: 'invalid' }];
    const broken = { ...image('map-1'), data: bytes(1) };
    expect((await plan(header(), [mapLine(setup('map-1'), broken), ...photos])).rejected).toEqual(refused);
    expect((await plan(header(), [mapLine(setup('map-1'), { ...image('map-2') }), ...photos])).rejected).toEqual(
      refused,
    );
    expect(
      (
        await plan(header({ hunterMap: { status: 'saved', maps: 2, activeId: null } }), [
          mapLine(setup('map-1'), image('map-1')),
          mapLine(setup('map-1'), image('map-1')),
          ...photos,
        ])
      ).rejected,
    ).toEqual(refused);
    expect((await plan(header({ hunterMap: { status: 'saved', maps: 2, activeId: null } }))).rejected).toEqual(refused);
    expect((await plan(header({ hunterMap: { status: 'saved', maps: 1, activeId: 'map-9' } }))).rejected).toEqual(
      refused,
    );
  });

  it('takes several maps with the open one among them', async () => {
    const result = await plan(header({ hunterMap: { status: 'saved', maps: 2, activeId: 'map-2' } }), [
      mapLine(setup('map-1'), image('map-1')),
      mapLine(setup('map-2'), image('map-2')),
      ...standardLines().slice(1),
    ]);
    expect(result.hunterMap).toEqual({
      action: 'replace',
      setups: [setup('map-1'), setup('map-2')],
      activeId: 'map-2',
    });
  });
});

describe('planItems', () => {
  it('yields the maps and photos of the plan again, checked, and none of what it leaves out', async () => {
    const file = fileOf(header({ photos: { 'hunting-log': 2, 'trap-tag': 1 } }), [
      ...standardLines(),
      photoLine(photo('t1', { tool: 'trap-tag' })),
    ]);
    const planned = await planFile(file);
    if (!planned.ok) throw new Error(planned.error);
    const items: string[] = [];
    for await (const item of planItems(readLines(file), planned.plan, file.size))
      items.push(item.kind === 'map' ? `map:${item.setup.id}` : `photo:${item.photo.id}`);
    expect(items).toEqual(['map:map-1', 'photo:p1', 'photo:p2']);
  });

  it('stops when the file no longer matches the plan', async () => {
    const planned = await plan();
    const changed = fileOf(header(), [mapLine(setup('map-1'), image('map-1')), 'not json\n']);
    await expect(async () => {
      for await (const item of planItems(readLines(changed), planned, changed.size)) void item;
    }).rejects.toThrow('no longer matches');
  });
});

// Pictures of a few megabytes go through base64 here, which is slow in jsdom.
describe('map pictures in chunks', { timeout: 30_000 }, () => {
  const big = (size: number) => ({
    ...image('map-1'),
    data: new Uint8Array(size).map((_, index) => (index * 7) % 256).buffer,
  });

  it('puts a picture of several chunks back together, byte for byte', async () => {
    const picture = big(MAP_CHUNK_BYTES * 2 + 5);
    const file = fileOf(header({ photos: {} }), [mapLine(setup('map-1'), picture)]);
    const planned = await planFile(file);
    if (!planned.ok) throw new Error(planned.error);
    expect(planned.plan.rejected).toEqual([]);
    const items = [];
    for await (const item of planItems(readLines(file), planned.plan, file.size)) items.push(item);
    expect(items).toHaveLength(1);
    const restored = items[0]!.kind === 'map' ? items[0]!.image.data : new ArrayBuffer(0);
    expect(new Uint8Array(restored)).toEqual(new Uint8Array(picture.data));
  });

  it('refuses the maps when a chunk is missing, extra, the wrong size or comes without its map', async () => {
    const lines = [...mapLines(setup('map-1'), big(MAP_CHUNK_BYTES + 10))];
    const refused = [{ part: { kind: 'hunter-map' }, reason: 'invalid' }];
    const photos = standardLines().slice(1);
    const check = async (mapText: string[]) => (await plan(header(), [...mapText, ...photos])).rejected;
    // The last chunk missing: the photo line after it cuts the map short.
    expect(await check(lines.slice(0, 2))).toEqual(refused);
    // A chunk of the wrong size.
    const wrong = `${JSON.stringify({ kind: 'map-chunk', data: 'AQID' })}\n`;
    expect(await check([lines[0]!, lines[1]!, wrong])).toEqual(refused);
    // More chunks than the details say: the extra one has no map to belong to.
    expect(await planFile(fileOf(header(), [...lines, wrong, ...photos]))).toEqual({
      ok: false,
      error: 'not-backup',
    });
    // A details line whose chunk count does not match its size.
    const details = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(await check([`${JSON.stringify({ ...details, chunks: 3 })}\n`, ...lines.slice(1)])).toEqual(refused);
  });

  it('stops reading at a line longer than any a backup writes', async () => {
    const long = `${JSON.stringify({ kind: 'photo', photo: { data: 'A'.repeat(8 * 1024 * 1024) } })}\n`;
    expect(await planFile(fileOf(header(), [long]))).toEqual({ ok: false, error: 'not-backup' });
  });
});

describe('what a file may ask the page to set aside', () => {
  /** Records every Uint8Array made while `run` runs, by the length it was made with. */
  async function allocations(run: () => Promise<unknown>): Promise<number[]> {
    const made: number[] = [];
    const real = globalThis.Uint8Array;
    globalThis.Uint8Array = new Proxy(real, {
      construct(target, args: unknown[]) {
        if (typeof args[0] === 'number') made.push(args[0]);
        return Reflect.construct(target, args) as object;
      },
    });
    try {
      await run();
    } finally {
      globalThis.Uint8Array = real;
    }
    return made;
  }

  it('sets nothing large aside for a small file that declares a large map picture', async () => {
    const huge = Math.floor(BACKUP_MAX_BYTES / 1024) * 1024;
    const details = {
      kind: 'map',
      setup: setup('map-1'),
      image: { ...image('map-1'), data: undefined, bytes: huge },
      chunks: Math.ceil(huge / MAP_CHUNK_BYTES),
    };
    const file = fileOf(header(), [`${JSON.stringify(details)}\n`]);
    expect(file.size).toBeLessThan(2000);
    let result: Awaited<ReturnType<typeof planFile>> | undefined;
    const made = await allocations(async () => {
      result = await planFile(file);
    });
    expect(Math.max(0, ...made)).toBeLessThan(1024 * 1024);
    expect(result?.ok && result.plan.rejected).toEqual(
      expect.arrayContaining([{ part: { kind: 'hunter-map' }, reason: 'invalid' }]),
    );
  });
});

describe('a tool’s own photo limit', () => {
  it('refuses more photos on a record than that tool keeps, though fewer than any tool may', async () => {
    const lines = (count: number) => [
      mapLine(setup('map-1'), image('map-1')),
      ...Array.from({ length: count }, (_, index) => photoLine(photo(`g${index}`, { tool: 'gibier-record' }))),
    ];
    const check = async (count: number) =>
      (await plan(header({ photos: { 'gibier-record': count } }), lines(count))).rejected;
    expect(await check(4)).toEqual([]);
    expect(await check(5)).toEqual([{ part: { kind: 'photos', tool: 'gibier-record' }, reason: 'invalid' }]);
  });
});
