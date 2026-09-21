import { generateTargetPdf } from '@/features/home-target/pdf';
import { targetPdfRequestSchema } from '@/features/home-target/schema';
import { createRoute, readJson, RequestError } from '@/lib/server/http';
import { rateLimitPresets } from '@/lib/server/rate-limit';

export const POST = createRoute(
  { rateLimit: rateLimitPresets.apiWrite, failureMessage: 'Failed to generate PDF' },
  async (request) => {
    const result = targetPdfRequestSchema.safeParse(await readJson(request));
    if (!result.success) throw new RequestError(400, 'Invalid request body');

    const pdf = generateTargetPdf(result.data.blackAreaSize.number * 10);
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '_').slice(0, 19);
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Home_Target_${timestamp}.pdf"`,
        'Content-Length': String(pdf.byteLength),
      },
    });
  },
);
