/**
 * Formats remaining seconds as MM:SS.
 * @param seconds Remaining seconds.
 * @returns Formatted time.
 */
export function formatRemainingTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}
