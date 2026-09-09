import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';

import type { ProtestFormDraft } from '@/shared/forms/ProtestFormDraft';
import { protestPdfLayouts, type ProtestPdfBox, type ProtestPdfLayout } from '@/shared/forms/ProtestPdfLayouts';

/** The PDF adapter only consumes completed values and an explicitly selected original. */
export async function fillProtestPdf(
  original: Uint8Array,
  draft: ProtestFormDraft,
  fontBytes?: Uint8Array,
  layouts: readonly ProtestPdfLayout[] = protestPdfLayouts,
): Promise<Uint8Array> {
  if (original.length > 5 * 1024 * 1024) throw new Error('The original form must be at most 5 MB');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', original)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const layout = layouts.find((candidate) => candidate.code === draft.code && candidate.sha256 === hash);
  if (!layout)
    throw new Error(
      'Select the unchanged official Form P / AP from Edition 2025 (Second Print 07/2026). This PDF does not match the selected form.',
    );
  const document = await PDFDocument.load(original);
  if (
    document.getPageCount() !== layout.pages ||
    document
      .getPages()
      .some(
        (page) =>
          Math.abs(page.getWidth() - layout.width) > 0.1 ||
          Math.abs(page.getHeight() - layout.height) > 0.1 ||
          page.getRotation().angle !== 0,
      )
  )
    throw new Error('The PDF page layout does not match this form profile');
  let font: PDFFont;
  if (fontBytes) {
    if (fontBytes.length > 30 * 1024 * 1024) throw new Error('The font must be at most 30 MB');
    const { default: fontkit } = await import('@pdf-lib/fontkit');
    document.registerFontkit(fontkit);
    font = await document.embedFont(fontBytes, { subset: true });
  } else font = await document.embedFont(StandardFonts.Helvetica);
  const characters = new Set(font.getCharacterSet());
  const fields = new Map(draft.fields.map((field) => [field.id, field]));
  for (const field of draft.fields) {
    if (field.id === 'decision' && field.value && !['Upheld', 'Denied'].includes(field.value))
      throw new Error('Review the decision: a partial outcome cannot be marked as upheld or denied automatically');
    if (
      [...field.value].some(
        (character) => character !== '\n' && character !== '\r' && !characters.has(character.codePointAt(0)!),
      )
    )
      throw new Error(`${field.label}: select a TTF/OTF font that supports these characters.`);
    if (field.value && !layout.boxes.some((box) => box.field === field.id))
      throw new Error(`No PDF field mapping for ${field.label}`);
  }
  for (const box of layout.boxes) {
    const field = fields.get(box.field);
    if (!field?.value) continue;
    if (box.when && field.value !== box.when) continue;
    const text = box.when ? 'X' : field.value;
    const { size, lines, lineHeight } = fitText(text, box, font, field.label);
    const page = document.getPage(box.page);
    lines.forEach((line, index) =>
      page.drawText(line, { x: box.x, y: page.getHeight() - box.top - size - index * lineHeight, font, size }),
    );
  }
  document.setTitle(`Draft Form ${draft.code} - ${draft.caseId}`);
  document.setSubject(
    'Prepared for review and signatures. Completion checks are operator confirmations, not electronic signatures.',
  );
  return document.save();
}

function fitText(text: string, box: ProtestPdfBox, font: PDFFont, label: string) {
  const minSize = box.width < 40 ? 5 : 8;
  for (let size = 10; size >= minSize; size -= 0.5) {
    const lineHeight = box.lineHeight ?? size + 2;
    const lines: string[] = [];
    for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
      let line = '';
      for (const character of paragraph) {
        try {
          if (font.widthOfTextAtSize(line + character, size) > box.width) {
            lines.push(line);
            line = '';
          }
          if (font.widthOfTextAtSize(character, size) > box.width) throw new Error('Character wider than the field');
        } catch {
          throw new Error(
            `${label}: this font cannot render the text. Select a TTF/OTF font that supports these characters.`,
          );
        }
        line += character;
      }
      lines.push(line);
    }
    if (size + (lines.length - 1) * lineHeight <= box.height) return { size, lines, lineHeight };
  }
  throw new Error(
    `${label} does not fit the official form. Shorten the draft entry and refer to an attachment; no text has been truncated.`,
  );
}
