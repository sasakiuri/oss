/**
 * Handing a file the page made to the reader, as a download. Nothing is sent anywhere: the file is
 * made in the browser and saved from it.
 */

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers start reading the file only after the click has returned.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
