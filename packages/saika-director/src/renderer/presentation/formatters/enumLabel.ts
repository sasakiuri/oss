/** Labels for upper snake case enum values. Panels keep the variant they show today. */

/** `FIRING_POINT_FAILURE` -> `Firing point failure` */
export function sentenceCaseLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

/** `FIRING_POINT_FAILURE` -> `Firing Point Failure` */
export function titleCaseLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** `FIRING_POINT_FAILURE` -> `firing point failure` */
export function lowerCaseLabel(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}
