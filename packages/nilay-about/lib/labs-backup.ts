import { z } from 'zod';

import {
  hunterMapSetupSchema,
  savedMapImageSchema,
  type HunterMapSetup,
  type SavedMapImage,
} from '@/lib/schemas/hunter-map';
import { PHOTO_MAX_BYTES, PHOTOS_PER_RECORD_MAX, savedPhotoSchema, type SavedPhoto } from '@/lib/schemas/photos';

/**
 * One file holding what the Labs tools saved in this browser, to keep as a backup or to carry to
 * another device.
 *
 * The file is JSON Lines: one JSON value per line. The first line is the header: the tools' saved
 * state from localStorage, keyed as it is stored there, and how many maps and photos follow. A hunter
 * map is a line with its setup and the picture's details, followed by the picture's bytes in lines of
 * at most `MAP_CHUNK_BYTES`; a photo, which is small, is one line. No line is larger than a photo, so
 * neither writing nor reading the file holds more than one picture's bytes and one line of text.
 *
 * Each part says whether it was left out, empty or saved, so that restoring an empty part clears what
 * the device has, while a part the export could not read leaves the device alone. The counts in the
 * header let a file that was cut short be told from a complete one.
 *
 * Reading a file back is planned before anything is written: each part is checked with the schema of
 * the tool it belongs to, and what does not pass is left out and named, never half applied.
 */

export const BACKUP_FORMAT = 'nilay-labs-backup';
export const BACKUP_VERSION = 3;
export const BACKUP_FILE_EXTENSION = '.jsonl';
export const BACKUP_MIME_TYPE = 'application/x-ndjson';

/**
 * The largest file the page writes or reads. The export estimates the size first and refuses, with the
 * reason, a backup that would be larger.
 */
export const BACKUP_MAX_BYTES = 256 * 1024 * 1024;
/** The bytes of a map picture carried by one line. */
export const MAP_CHUNK_BYTES = 1024 * 1024;

const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;
/** The longest line that is read: one photo as base64 with its details. */
const MAX_LINE_LENGTH = base64Length(PHOTO_MAX_BYTES) + 64 * 1024;

const base64Schema = (maxBytes: number) =>
  z
    .string()
    .max(base64Length(maxBytes))
    .regex(/^[A-Za-z0-9+/]*={0,2}$/);

const encodedPhotoSchema = savedPhotoSchema.omit({ data: true }).extend({ data: base64Schema(PHOTO_MAX_BYTES) });
/** A map picture's details, in the line before its bytes. */
const mapImageDetailsSchema = savedMapImageSchema.omit({ data: true }).extend({
  // The map tool sets no limit of its own on a picture, so the file's is the only one.
  bytes: z.number().int().positive().max(BACKUP_MAX_BYTES),
});

const countSchema = z.number().int().nonnegative();

export const backupHeaderSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().datetime(),
  /** Each tool's saved value, as `persist` wrote it under its key. Checked per tool, not here. */
  localStorage: z.record(z.string(), z.unknown()),
  /**
   * `saved`: this many maps follow, and which one was open. `empty`: there were no maps, and restoring
   * clears the device's. `not-included`: the export could not read them; restoring leaves them alone.
   */
  hunterMap: z.discriminatedUnion('status', [
    z.object({ status: z.literal('saved'), maps: countSchema, activeId: z.string().nullable() }),
    z.object({ status: z.literal('empty') }),
    z.object({ status: z.literal('not-included') }),
  ]),
  /**
   * How many photos follow for each tool whose records are in the file (0 clears the device's). A tool
   * missing here is left alone; `null` means the export could not read the photos at all.
   */
  photos: z.record(z.string(), countSchema).nullable(),
});
export type BackupHeader = z.infer<typeof backupHeaderSchema>;

const lineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('map'),
    setup: z.unknown(),
    image: z.unknown(),
    chunks: z
      .number()
      .int()
      .nonnegative()
      .max(Math.ceil(BACKUP_MAX_BYTES / MAP_CHUNK_BYTES)),
  }),
  z.object({ kind: z.literal('map-chunk'), data: base64Schema(MAP_CHUNK_BYTES) }),
  z.object({ kind: z.literal('photo'), photo: z.unknown() }),
]);

/** Bytes as base64, in slices, so a picture of several megabytes does not overflow the call stack. */
export function encodeBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

export function decodeBase64(text: string): ArrayBuffer | null {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

/**
 * Keys a restore writes its own records under, in the photo and map databases, and the photo deletion
 * counts; no id from a file may take one.
 */
const isReserved = (id: string) => id.startsWith('restore:') || id.startsWith('trash:') || id.startsWith('deletions:');

// ---- Writing ----

export type HunterMapHeader = BackupHeader['hunterMap'];

export function headerLine(header: Omit<BackupHeader, 'format' | 'version'>): string {
  return `${JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, ...header })}\n`;
}

const chunkCount = (bytes: number) => Math.ceil(bytes / MAP_CHUNK_BYTES);

/** A map's lines: its setup and the picture's details, then the picture a chunk at a time. */
export function* mapLines(setup: HunterMapSetup, image: SavedMapImage): Generator<string> {
  const { data, ...details } = image;
  yield `${JSON.stringify({ kind: 'map', setup, image: { ...details, bytes: data.byteLength }, chunks: chunkCount(data.byteLength) })}\n`;
  const bytes = new Uint8Array(data);
  for (let start = 0; start < bytes.length; start += MAP_CHUNK_BYTES)
    yield `${JSON.stringify({ kind: 'map-chunk', data: encodeBase64(bytes.subarray(start, start + MAP_CHUNK_BYTES)) })}\n`;
}

export function photoLine(photo: SavedPhoto): string {
  return `${JSON.stringify({ kind: 'photo', photo: { ...photo, data: encodeBase64(photo.data) } })}\n`;
}

const utf8Length = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** The size a map's lines take, from its setup and picture, without building them. */
export function estimateMapBytes(setup: HunterMapSetup, image: SavedMapImage): number {
  const { data, ...details } = image;
  const chunks = chunkCount(data.byteLength);
  return (
    utf8Length({ kind: 'map', setup, image: { ...details, bytes: data.byteLength }, chunks }) +
    base64Length(data.byteLength) +
    chunks * 64
  );
}

/** The size a photo's line takes, without building it. */
export function estimatePhotoBytes(photo: SavedPhoto): number {
  return base64Length(photo.data.byteLength) + utf8Length({ kind: 'photo', photo: { ...photo, data: '' } }) + 8;
}

// ---- Reading ----

/**
 * The lines of a file, read a slice at a time, so a large file is never held whole. A line longer than
 * any a backup writes ends the reading with an error.
 */
export async function* readLines(file: Blob, sliceBytes = 4 * 1024 * 1024): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let pending = '';
  for (let start = 0; start < file.size; start += sliceBytes) {
    const bytes = await file.slice(start, start + sliceBytes).arrayBuffer();
    pending += decoder.decode(bytes, { stream: true });
    let end = pending.indexOf('\n');
    while (end !== -1) {
      yield pending.slice(0, end);
      pending = pending.slice(end + 1);
      end = pending.indexOf('\n');
    }
    if (pending.length > MAX_LINE_LENGTH) throw new Error('A line is longer than any a backup writes');
  }
  pending += decoder.decode();
  if (pending.length > 0) yield pending;
}

/** Why a part of the file is not read back. */
export type RejectReason =
  /** Nothing in Labs saves under this key, or keeps photos for this tool. */
  | 'unknown'
  /** The tool's schema refuses it, it is over a limit, or the file was cut short within it. */
  | 'invalid'
  /** Photos whose records are not restored with them: they would belong to records that are not there. */
  | 'records-rejected';

export type BackupPart = { kind: 'storage'; key: string } | { kind: 'hunter-map' } | { kind: 'photos'; tool: string };

/** What a restore will do. It holds no picture: those are read from the file again as they are written. */
export interface ImportPlan {
  exportedAt: string;
  /** Saved values that pass, by key, to be written as they are. */
  storage: { key: string; value: unknown }[];
  /**
   * `replace`: the device's maps become these (their pictures follow in the file). `clear`: the file
   * had no maps. Null: leave the device's maps alone.
   */
  hunterMap: { action: 'replace'; setups: HunterMapSetup[]; activeId: string | null } | { action: 'clear' } | null;
  /** Each tool whose photos are replaced by those in the file, and how many there are (0 clears them). */
  photos: { tool: string; count: number }[];
  rejected: { part: BackupPart; reason: RejectReason }[];
  /** Parts the export itself could not read, so the file does not hold them. */
  notIncluded: ('hunter-map' | 'photos')[];
}

/** Where a tool that keeps photos keeps the records they belong to. */
export interface PhotoRecords {
  /** The localStorage key of the records. */
  key: string;
  /** The ids of the records in a saved value of that key, which a photo's `ownerId` must name. */
  ids: (value: unknown) => ReadonlySet<string>;
  /** The most photos the tool keeps on one record: its own limit, at most `PHOTOS_PER_RECORD_MAX`. */
  maxPerRecord: number;
}

export interface ImportRules {
  /** Checks a saved value with the store saved under `key`; undefined when no store uses the key. */
  accepts: (key: string, value: unknown) => boolean | undefined;
  /** Where a tool keeps the records its photos belong to; undefined for a tool without photos. */
  photoRecords: (tool: string) => PhotoRecords | undefined;
  /** Whether the browser draws a picture at the size it claims; the tools check the same on opening one. */
  pictureDecodes: (data: ArrayBuffer, type: string, width: number, height: number) => Promise<boolean>;
}

export type ReadBackupResult = { ok: true; plan: ImportPlan } | { ok: false; error: 'not-json' | 'not-backup' };

class NotBackupError extends Error {}

function parseLine(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** One photo, checked. */
export function decodePhoto(value: unknown): SavedPhoto | null {
  const encoded = encodedPhotoSchema.safeParse(value);
  if (!encoded.success) return null;
  const data = decodeBase64(encoded.data.data);
  if (!data) return null;
  const parsed = savedPhotoSchema.safeParse({ ...encoded.data, data });
  return parsed.success && !isReserved(parsed.data.id) ? parsed.data : null;
}

/** One map, checked: the setup and its picture, which share one id. */
function decodeMap(setup: unknown, details: unknown, data: ArrayBuffer | null) {
  const checkedSetup = hunterMapSetupSchema.safeParse(setup);
  const checkedDetails = mapImageDetailsSchema.safeParse(details);
  if (!data || !checkedSetup.success || !checkedDetails.success) return null;
  const { bytes, ...rest } = checkedDetails.data;
  const image = savedMapImageSchema.safeParse({ ...rest, data });
  if (!image.success || bytes !== data.byteLength) return null;
  if (image.data.id !== checkedSetup.data.id || isReserved(image.data.id)) return null;
  return { setup: checkedSetup.data, image: image.data };
}

type Entry =
  | { kind: 'map'; map: { setup: HunterMapSetup; image: SavedMapImage } | null }
  | { kind: 'photo'; tool: string; raw: unknown };

const toolOf = (value: unknown) =>
  typeof value === 'object' && value !== null && 'tool' in value && typeof value.tool === 'string' ? value.tool : '';

/**
 * The maps and photos after the header, one at a time. A map's chunks are put together into one
 * buffer as they are read; a map whose chunks are missing, cut short or of the wrong size comes out as
 * `null`. A line that is not a backup line ends the reading with an error.
 */
async function* entries(lines: AsyncIterator<string>, sourceBytes: number): AsyncGenerator<Entry> {
  let pending: {
    setup: unknown;
    details: unknown;
    buffer: Uint8Array | null;
    offset: number;
    remaining: number;
    broken: boolean;
  } | null = null;
  /** The map waiting for chunks, done; `cut` when another line came before its last chunk. */
  const finish = (cut = false): Entry => {
    const map = pending!;
    pending = null;
    const whole = !cut && !map.broken && map.buffer !== null && map.offset === map.buffer.length;
    return { kind: 'map', map: whole ? decodeMap(map.setup, map.details, map.buffer!.buffer as ArrayBuffer) : null };
  };
  for (let next = await lines.next(); !next.done; next = await lines.next()) {
    if (next.value.trim() === '') continue;
    const line = lineSchema.safeParse(parseLine(next.value));
    if (!line.success) throw new NotBackupError();
    if (line.data.kind === 'map-chunk') {
      if (!pending) throw new NotBackupError();
      const chunk = decodeBase64(line.data.data);
      const current = pending as NonNullable<typeof pending>;
      if (!chunk || !current.buffer || current.offset + chunk.byteLength > current.buffer.length) current.broken = true;
      else {
        current.buffer.set(new Uint8Array(chunk), current.offset);
        current.offset += chunk.byteLength;
      }
      current.remaining -= 1;
      if (current.remaining === 0) yield finish();
      continue;
    }
    // Any other line ends a map still waiting for chunks: it was cut short.
    if (pending) yield finish(true);
    if (line.data.kind === 'map') {
      const details = mapImageDetailsSchema.safeParse(line.data.image);
      // The size is the file's word only: nothing is set aside for a picture larger than the file could
      // carry as base64, so a small file cannot make the page reserve a large buffer.
      const fits = details.success && base64Length(details.data.bytes) <= sourceBytes;
      const expected = fits ? chunkCount(details.data.bytes) : -1;
      pending = {
        setup: line.data.setup,
        details: line.data.image,
        // Allocated once, at the size the details give, and filled chunk by chunk.
        buffer: fits && expected === line.data.chunks ? new Uint8Array(details.data.bytes) : null,
        offset: 0,
        remaining: line.data.chunks,
        broken: expected !== line.data.chunks,
      };
      if (pending.remaining === 0) yield finish();
      continue;
    }
    yield { kind: 'photo', tool: toolOf(line.data.photo), raw: line.data.photo };
  }
  if (pending) yield finish(true);
}

/**
 * Reads a backup one line at a time into a plan of what would be restored and what would be left out.
 * Every picture is put together, decoded and checked here, then let go, so the plan holds none of them.
 */
export async function planBackup(
  lines: AsyncIterable<string>,
  rules: ImportRules,
  /** The size of the file the lines come from, which bounds what any line may ask to be set aside. */
  sourceBytes: number,
): Promise<ReadBackupResult> {
  const iterator = lines[Symbol.asyncIterator]();
  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch {
    return { ok: false, error: 'not-backup' };
  }
  if (first.done) return { ok: false, error: 'not-json' };
  const headerValue = parseLine(first.value);
  if (headerValue === undefined) return { ok: false, error: 'not-json' };
  const header = backupHeaderSchema.safeParse(headerValue);
  if (!header.success) return { ok: false, error: 'not-backup' };

  const rejected: ImportPlan['rejected'] = [];
  const notIncluded: ImportPlan['notIncluded'] = [];
  const storage: ImportPlan['storage'] = [];
  for (const [key, value] of Object.entries(header.data.localStorage)) {
    const accepted = rules.accepts(key, value);
    if (accepted) storage.push({ key, value });
    else rejected.push({ part: { kind: 'storage', key }, reason: accepted === undefined ? 'unknown' : 'invalid' });
  }
  const restored = new Map(storage.map(({ key, value }) => [key, value]));

  // Photos are taken or refused per tool, so a tool never ends up with some of its photos.
  interface ToolPhotos {
    expected: number;
    seen: number;
    ids: ReadonlySet<string> | null;
    limit: number;
    perRecord: Map<string, number>;
    problem: RejectReason | null;
  }
  const tools = new Map<string, ToolPhotos>();
  if (header.data.photos === null) notIncluded.push('photos');
  for (const [tool, expected] of Object.entries(header.data.photos ?? {})) {
    const records = rules.photoRecords(tool);
    const recordsValue = records && restored.get(records.key);
    const ids = records && recordsValue !== undefined ? records.ids(recordsValue) : null;
    const problem: RejectReason | null = !records ? 'unknown' : ids === null ? 'records-rejected' : null;
    const limit = Math.min(records?.maxPerRecord ?? PHOTOS_PER_RECORD_MAX, PHOTOS_PER_RECORD_MAX);
    tools.set(tool, { expected, seen: 0, ids, limit, perRecord: new Map(), problem });
  }
  const photoIds = new Set<string>();

  const mapHeader = header.data.hunterMap;
  if (mapHeader.status === 'not-included') notIncluded.push('hunter-map');
  const setups: HunterMapSetup[] = [];
  let mapsSeen = 0;
  let mapsValid = mapHeader.status === 'saved';

  try {
    for await (const entry of entries(iterator, sourceBytes)) {
      if (entry.kind === 'map') {
        mapsSeen += 1;
        if (!mapsValid) continue;
        const map = entry.map;
        if (
          !map ||
          setups.some((setup) => setup.id === map.setup.id) ||
          !(await rules.pictureDecodes(map.image.data, map.image.type, map.image.width, map.image.height))
        )
          mapsValid = false;
        else setups.push(map.setup);
        continue;
      }
      const group = tools.get(entry.tool);
      if (!group) {
        // A photo for a tool the header does not list: the file was put together wrongly.
        if (!rejected.some(({ part }) => part.kind === 'photos' && part.tool === entry.tool))
          rejected.push({
            part: { kind: 'photos', tool: entry.tool },
            reason: rules.photoRecords(entry.tool) ? 'invalid' : 'unknown',
          });
        continue;
      }
      group.seen += 1;
      if (group.problem) continue;
      const photo = decodePhoto(entry.raw);
      const owner = photo?.ownerId ?? '';
      const count = (group.perRecord.get(owner) ?? 0) + 1;
      group.perRecord.set(owner, count);
      if (
        !photo ||
        photo.tool !== entry.tool ||
        photoIds.has(photo.id) ||
        // A photo of a record that is not restored with it would belong to nothing.
        !group.ids?.has(owner) ||
        count > group.limit ||
        !(await rules.pictureDecodes(photo.data, photo.type, photo.width, photo.height))
      )
        group.problem = 'invalid';
      else photoIds.add(photo.id);
    }
  } catch {
    return { ok: false, error: 'not-backup' };
  }

  let hunterMap: ImportPlan['hunterMap'] = null;
  if (mapHeader.status === 'empty') hunterMap = mapsSeen === 0 ? { action: 'clear' } : null;
  else if (mapHeader.status === 'saved') {
    const activeKnown = mapHeader.activeId === null || setups.some((setup) => setup.id === mapHeader.activeId);
    if (mapsValid && mapsSeen === mapHeader.maps && setups.length === mapHeader.maps && activeKnown)
      hunterMap = { action: 'replace', setups, activeId: mapHeader.activeId };
  }
  if (mapHeader.status !== 'not-included' && hunterMap === null)
    rejected.push({ part: { kind: 'hunter-map' }, reason: 'invalid' });

  const photos: ImportPlan['photos'] = [];
  for (const [tool, group] of tools) {
    // A file cut short within a tool's photos is refused for that tool.
    const problem = group.problem ?? (group.seen === group.expected ? null : 'invalid');
    if (problem) rejected.push({ part: { kind: 'photos', tool }, reason: problem });
    else photos.push({ tool, count: group.expected });
  }

  return {
    ok: true,
    plan: { exportedAt: header.data.exportedAt, storage, hunterMap, photos, rejected, notIncluded },
  };
}

/**
 * The maps and photos a plan restores, read from the file again and checked again as they are
 * written, one at a time. Ends with an error if the file no longer matches the plan.
 */
export async function* planItems(
  lines: AsyncIterable<string>,
  plan: ImportPlan,
  sourceBytes: number,
): AsyncGenerator<{ kind: 'map'; setup: HunterMapSetup; image: SavedMapImage } | { kind: 'photo'; photo: SavedPhoto }> {
  const tools = new Set(plan.photos.map(({ tool }) => tool));
  const maps = plan.hunterMap?.action === 'replace' ? new Set(plan.hunterMap.setups.map(({ id }) => id)) : null;
  const iterator = lines[Symbol.asyncIterator]();
  await iterator.next();
  const changed = () => new Error('The file no longer matches what was checked');
  try {
    for await (const entry of entries(iterator, sourceBytes)) {
      if (entry.kind === 'map') {
        if (!maps) continue;
        if (!entry.map || !maps.has(entry.map.setup.id)) throw changed();
        yield { kind: 'map', ...entry.map };
        continue;
      }
      if (!tools.has(entry.tool)) continue;
      const photo = decodePhoto(entry.raw);
      if (!photo || photo.tool !== entry.tool) throw changed();
      yield { kind: 'photo', photo };
    }
  } catch (error) {
    throw error instanceof NotBackupError ? changed() : error;
  }
}
