import type { LabsToolSlug } from '@/lib/labs-tools';
import { speedUnitSchema } from '@/lib/schemas/trajectory';

/**
 * Carrying a value from one tool to another in the link's query string, such as the mean velocity
 * measured in one tool into the muzzle velocity of the next.
 *
 * Each receiving tool declares once which values it takes and how each is read. The sending tool builds
 * its link from that declaration and the receiving tool reads the query with it, so the two cannot
 * drift apart. A link is read whole: a value that is missing or cannot be read refuses the lot, and
 * the receiving tool says so instead of applying half of it.
 */

// Methods rather than function properties, so a `Param<number>` still counts as a `Param<unknown>`.
interface Param<T> {
  write(value: T): string;
  /** The value, or undefined when the text is not one. */
  read(text: string): T | undefined;
}

// Number('') is 0 and Number('1e2') is 100, so only a plain decimal is read as a number.
const DECIMAL = /^[+-]?\d+(\.\d+)?$/;

/**
 * A number as a plain decimal, which `numberParam` reads back to the same number. `String()` switches
 * to exponent notation below 1e-6 and from 1e21; the small ones are written out in full, and a number
 * too large to write that way is refused rather than sent as a link the other tool would refuse.
 */
export function plainDecimal(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21) throw new RangeError(`Cannot write ${value} as a decimal`);
  const text = String(value);
  if (!/e/i.test(text)) return text;
  // toFixed(100) rounds, so the shortest digits that read back to the same number are looked for.
  for (let digits = 1; digits <= 100; digits += 1) {
    const fixed = value.toFixed(digits);
    if (Number(fixed) === value) return fixed;
  }
  throw new RangeError(`Cannot write ${value} as a decimal`);
}

export function numberParam(options: { min?: number; max?: number; positive?: boolean } = {}): Param<number> {
  return {
    write: plainDecimal,
    read: (text) => {
      if (!DECIMAL.test(text)) return undefined;
      const value = Number(text);
      if (!Number.isFinite(value)) return undefined;
      if (options.positive && value <= 0) return undefined;
      if (options.min !== undefined && value < options.min) return undefined;
      if (options.max !== undefined && value > options.max) return undefined;
      return value;
    },
  };
}

export function enumParam<const T extends string>(values: readonly T[]): Param<T> {
  return {
    write: (value) => value,
    read: (text) => values.find((value) => value === text),
  };
}

export type HandoffParams = Record<string, Param<unknown>>;
type Params = HandoffParams;
export type HandoffValues<P extends Params> = { [K in keyof P]: P[K] extends Param<infer T> ? T : never };

/** What a tool found in its query string: nothing for it, a set of values, or a link it cannot read. */
export type HandoffReading<P extends Params> =
  { state: 'none' } | { state: 'received'; values: HandoffValues<P> } | { state: 'invalid' };

export interface Handoff<P extends Params> {
  slug: LabsToolSlug;
  /** A path and query string that opens the receiving tool with these values. */
  href: (values: HandoffValues<P>) => string;
  read: (search: string | URLSearchParams) => HandoffReading<P>;
  /** The query keys this handoff uses, so the tool can take them off the address once read. */
  keys: readonly string[];
}

export function defineHandoff<P extends Params>(slug: LabsToolSlug, params: P): Handoff<P> {
  const keys = Object.keys(params);
  return {
    slug,
    keys,
    href: (values) => {
      const query = new URLSearchParams();
      for (const key of keys) query.set(key, params[key]!.write(values[key]));
      return `/labs/${slug}?${query.toString()}`;
    },
    read: (search) => {
      const query = typeof search === 'string' ? new URLSearchParams(search) : search;
      // Nothing of this handoff in the address is an ordinary visit, not a broken link.
      if (!keys.some((key) => query.has(key))) return { state: 'none' };
      const values: Record<string, unknown> = {};
      for (const key of keys) {
        const text = query.get(key);
        const value = text === null ? undefined : params[key]!.read(text);
        if (value === undefined) return { state: 'invalid' };
        values[key] = value;
      }
      return { state: 'received', values: values as HandoffValues<P> };
    },
  };
}

/**
 * Reads what another tool sent in this page's address and hands the values to `apply`. Called once the
 * tool has read its own saved state: the values replace what was saved, which is what following the
 * link asked for. The keys are then taken off the address, so a reload or a bookmark opens the tool as
 * the reader left it rather than applying the link again over later edits. What was found is returned,
 * so the tool can say what it received, or that the link could not be read.
 */
export function receiveHandoff<P extends HandoffParams>(
  handoff: Handoff<P>,
  apply: (values: HandoffValues<P>) => void,
): HandoffReading<P> {
  const url = new URL(window.location.href);
  const found = handoff.read(url.searchParams);
  if (found.state === 'none') return found;
  if (found.state === 'received') apply(found.values);
  for (const key of handoff.keys) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return found;
}

/** Velocity spread → twist rate and stability: the measured mean becomes the muzzle velocity. */
export const twistStabilityHandoff = defineHandoff('twist-stability', {
  muzzleSpeed: numberParam({ positive: true }),
  speedUnit: enumParam(speedUnitSchema.options),
});
