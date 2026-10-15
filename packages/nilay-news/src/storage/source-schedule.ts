// SPDX-License-Identifier: MIT
import type { Source } from "../domain.ts";
import type { SourceConfig } from "../sources/types.ts";

/** `offset/period` of a source phased by `collectionOffsetMinutes`, or null. */
export function phaseOf(config: SourceConfig): string | null {
  return config.collectionOffsetMinutes === undefined
    ? null
    : `${config.collectionOffsetMinutes}/${config.minCollectionMinutes ?? 60}`;
}

/** The stored automatic time of an offset source under its current phase. */
export function autoCollectAt(source: Source, phase: string): number {
  return source.autoCollectPhase === phase &&
    typeof source.autoCollectAt === "string"
    ? Date.parse(source.autoCollectAt) / 1000
    : Number.NaN;
}
