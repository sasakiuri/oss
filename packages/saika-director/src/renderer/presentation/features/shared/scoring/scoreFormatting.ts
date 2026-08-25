export function formatScore(score: number | undefined): string {
  if (score === undefined) return '-';
  return score.toFixed(1);
}

export function formatOrdinal(rank: number): string {
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  const v = rank % 100;
  if (v >= 11 && v <= 13) {
    return `${rank}th`;
  }
  const suffix = suffixes[v % 10] ?? 'th';
  return `${rank}${suffix}`;
}
