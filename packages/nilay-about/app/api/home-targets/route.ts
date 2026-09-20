import { NextResponse } from 'next/server';
import { z } from 'zod';

import { checkRateLimit, getClientIp, rateLimitPresets } from '@/lib/api/rate-limit';
import { createRequestLogger } from '@/lib/logging';

const DOCUMENT_TITLE = 'Home Target';
const DOCUMENT_AUTHOR = 'Nilay Sport';

// Request validation schema
const requestSchema = z.object({
  blackAreaSize: z.object({
    number: z.number().positive().max(100), // max 100cm = 1000mm
    unit: z.literal('cm'),
  }),
});

/**
 * Generate a simple PDF with a black circle target
 *
 * PDF structure based on PDF 1.7 specification:
 * - Single page with custom dimensions
 * - Black filled circle centered on page
 */
function generateTargetPdf(blackAreaSizeMm: number): Uint8Array {
  const paperSizeMm = blackAreaSizeMm * 1.2;
  // Convert mm to PDF points (1 point = 1/72 inch, 1 inch = 25.4mm)
  const paperSizePt = (paperSizeMm / 25.4) * 72;
  const radius = (blackAreaSizeMm / 2 / 25.4) * 72;
  const centerX = paperSizePt / 2;
  const centerY = paperSizePt / 2;

  // Generate content stream for the circle
  const contentStreamData = generateCircleContent(centerX, centerY, radius);

  // Build PDF objects (minimal PDF structure)
  const pdfObjects: { id: number; content: string }[] = [];

  // 1: Catalog
  pdfObjects.push({
    id: 1,
    content: `<< /Type /Catalog /Pages 2 0 R >>`,
  });

  // 2: Pages
  pdfObjects.push({
    id: 2,
    content: `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
  });

  // 3: Page
  pdfObjects.push({
    id: 3,
    content: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${paperSizePt.toFixed(2)} ${paperSizePt.toFixed(2)}] /Contents 4 0 R >>`,
  });

  // 4: Content stream
  pdfObjects.push({
    id: 4,
    content: `<< /Length ${contentStreamData.length} >>\nstream\n${contentStreamData}\nendstream`,
  });

  // Build PDF
  let pdf = '%PDF-1.7\n%\xFF\xFF\xFF\xFF\n';
  const xrefOffsets: number[] = [];

  for (const obj of pdfObjects) {
    xrefOffsets.push(pdf.length);
    pdf += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
  }

  // Cross-reference table
  const xrefStart = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${pdfObjects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of xrefOffsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }

  // Trailer
  pdf += 'trailer\n';
  pdf += `<< /Size ${pdfObjects.length + 1} /Root 1 0 R /Info << /Title (${DOCUMENT_TITLE}) /Author (${DOCUMENT_AUTHOR}) >> >>\n`;
  pdf += 'startxref\n';
  pdf += `${xrefStart}\n`;
  pdf += '%%EOF\n';

  return new TextEncoder().encode(pdf);
}

/**
 * Generate PDF content stream for a filled circle
 * Uses Bezier curves to approximate a circle
 */
function generateCircleContent(cx: number, cy: number, r: number): string {
  // Bezier curve control point factor for circle approximation
  // k = 4 * (sqrt(2) - 1) / 3 ≈ 0.5522847498
  const k = 0.5522847498;

  const lines: string[] = [];

  // Set fill color to black
  lines.push('0 0 0 rg');

  // Move to starting point (right side of circle)
  lines.push(`${(cx + r).toFixed(4)} ${cy.toFixed(4)} m`);

  // Draw 4 Bezier curves to form a circle
  // Top-right quadrant
  lines.push(
    `${(cx + r).toFixed(4)} ${(cy + r * k).toFixed(4)} ${(cx + r * k).toFixed(4)} ${(cy + r).toFixed(4)} ${cx.toFixed(4)} ${(cy + r).toFixed(4)} c`,
  );
  // Top-left quadrant
  lines.push(
    `${(cx - r * k).toFixed(4)} ${(cy + r).toFixed(4)} ${(cx - r).toFixed(4)} ${(cy + r * k).toFixed(4)} ${(cx - r).toFixed(4)} ${cy.toFixed(4)} c`,
  );
  // Bottom-left quadrant
  lines.push(
    `${(cx - r).toFixed(4)} ${(cy - r * k).toFixed(4)} ${(cx - r * k).toFixed(4)} ${(cy - r).toFixed(4)} ${cx.toFixed(4)} ${(cy - r).toFixed(4)} c`,
  );
  // Bottom-right quadrant
  lines.push(
    `${(cx + r * k).toFixed(4)} ${(cy - r).toFixed(4)} ${(cx + r).toFixed(4)} ${(cy - r * k).toFixed(4)} ${(cx + r).toFixed(4)} ${cy.toFixed(4)} c`,
  );

  // Fill the path
  lines.push('f');

  return lines.join('\n');
}

export async function POST(request: Request) {
  const log = createRequestLogger(request);

  try {
    // Rate limiting check (apiWrite: 20 requests per minute)
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(clientIp, rateLimitPresets.apiWrite);

    if (!rateLimit.allowed) {
      log.warn('Rate limit exceeded', { clientIp, resetIn: rateLimit.resetIn });
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        },
      );
    }

    // Parse JSON body with explicit error handling
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      log.warn('Invalid JSON in request body');
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    const result = requestSchema.safeParse(body);

    if (!result.success) {
      log.warn('Invalid request body', {
        errors: result.error.flatten(),
      });
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { blackAreaSize } = result.data;

    // Convert cm to mm
    const blackAreaSizeMm = blackAreaSize.number * 10;

    if (blackAreaSizeMm > 1000) {
      log.warn('Target size too large', { sizeMm: blackAreaSizeMm });
      return NextResponse.json({ error: 'Target size too large (max 100cm)' }, { status: 400 });
    }

    // Generate PDF
    const pdfData = generateTargetPdf(blackAreaSizeMm);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '_').slice(0, 19);
    const filename = `Home_Target_${timestamp}.pdf`;

    log.info('PDF generated successfully', {
      sizeMm: blackAreaSizeMm,
      filename,
    });

    return new Response(Buffer.from(pdfData), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfData.length),
      },
    });
  } catch (error) {
    log.error('Failed to generate PDF', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
