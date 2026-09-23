import { getTargetLayout } from '@/lib/home-target';
import { generateTargetPdf } from '@/lib/home-target-pdf';
import { targetRequestSchema } from '@/lib/schemas/home-target';
import { createRoute, readJson, RequestError } from '@/lib/server/http';
import { rateLimitPresets } from '@/lib/server/rate-limit';

export const POST = createRoute(
  { rateLimit: rateLimitPresets.apiWrite, failureMessage: 'Failed to generate PDF' },
  async (request) => {
    const result = targetRequestSchema.safeParse(await readJson(request));
    if (!result.success) throw new RequestError(400, 'Invalid request body');

    const { blackAreaSize, paper, ...options } = result.data;
    const blackAreaSizeMm = blackAreaSize.number * 10;
    if (!getTargetLayout(blackAreaSizeMm, paper, options).fits) {
      throw new RequestError(400, 'Target does not fit the selected paper');
    }

    const pdf = generateTargetPdf(blackAreaSizeMm, paper, options);
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
