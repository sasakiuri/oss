import { targetPdfRequestSchema } from './schema';

export async function downloadTarget(diameterCm: number): Promise<void> {
  const request = targetPdfRequestSchema.parse({ blackAreaSize: { number: diameterCm, unit: 'cm' } });
  const response = await fetch('/api/home-targets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Target PDF request failed (${response.status})`);
  if (!response.headers.get('content-type')?.startsWith('application/pdf')) {
    throw new Error('Target PDF response has an unexpected content type');
  }

  const filename = response.headers.get('content-disposition')?.match(/filename="?([^";\n]+)"?/)?.[1];
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = filename ?? 'Home_Target.pdf';
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
