/** Coordinates in points from the top left of the identified, unmodified original PDF. */
export interface ProtestPdfBox {
  field: string;
  page: number;
  x: number;
  top: number;
  width: number;
  height: number;
  lineHeight?: number;
  when?: string;
}
export interface ProtestPdfLayout {
  code: 'P' | 'AP';
  sha256: string;
  pages: number;
  width: number;
  height: number;
  boxes: readonly ProtestPdfBox[];
}
const box = (
  field: string,
  page: number,
  x: number,
  top: number,
  width: number,
  height = 12,
  lineHeight?: number,
  when?: string,
): ProtestPdfBox => ({
  field,
  page,
  x,
  top,
  width,
  height,
  ...(lineHeight ? { lineHeight } : {}),
  ...(when ? { when } : {}),
});

// ISSF Edition 2025, Second Print 07/2026. Originals are supplied locally by the operator.
export const protestPdfLayouts: readonly ProtestPdfLayout[] = [
  {
    code: 'P',
    sha256: '3bd6a350d6839c2fbfba66d928c18dd80e868df8624d5db677aa92d4b3f53d2c',
    pages: 2,
    width: 595.276,
    height: 841.89,
    boxes: [
      box('event', 0, 85, 202, 420),
      box('jury', 0, 115, 220, 385),
      box('actionDate', 0, 71, 245, 28),
      box('actionTime', 0, 145, 245, 78),
      box('subject', 0, 49, 284, 450, 128, 19.7),
      box('reason', 0, 49, 441, 450, 110, 19.7),
      box('submittedBy', 0, 49, 609, 240),
      box('receiptDate', 0, 152, 662, 70),
      box('receiptTime', 0, 253, 662, 110),
      box('fee', 0, 135, 682, 85),
      box('receiver', 0, 290, 682, 210),
      box('receiver', 0, 49, 731, 235),
      box('meetingDate', 1, 164, 103, 128),
      box('meetingTime', 1, 310, 103, 100),
      box('decision', 1, 255, 141, 9, 12, undefined, 'Upheld'),
      box('decision', 1, 380, 141, 9, 12, undefined, 'Denied'),
      box('decisionReason', 1, 91, 190, 450, 355, 19.4),
      box('chair', 1, 92, 636, 240),
      box('notificationDate', 1, 127, 689, 180),
      box('notificationTime', 1, 127, 707, 180),
      box('feeDisposition', 1, 205, 725, 190),
    ],
  },
  {
    code: 'AP',
    sha256: '6b75869147b6b4c30e05bb2cfc30c41c13f22b27c5319e963a9a1f149b40ceb5',
    pages: 2,
    width: 595.276,
    height: 841.89,
    boxes: [
      box('reason', 0, 49, 251, 450, 305, 19.6),
      box('submittedBy', 0, 49, 628, 230),
      box('nation', 0, 285, 628, 90),
      box('receiptDate', 0, 205, 679, 44),
      box('receiptTime', 0, 280, 679, 125),
      box('fee', 0, 133, 697, 94),
      box('receiver', 0, 296, 697, 205),
      box('receiver', 0, 49, 729, 235),
      box('meetingDate', 1, 211, 97, 50),
      box('meetingTime', 1, 280, 97, 65),
      box('decision', 1, 264, 134, 9, 12, undefined, 'Upheld'),
      box('decision', 1, 352, 134, 9, 12, undefined, 'Denied'),
      box('decisionReason', 1, 91, 181, 450, 305, 19.5),
      box('chair', 1, 92, 562, 240),
      box('notificationDate', 1, 127, 634, 180),
      box('notificationTime', 1, 127, 653, 180),
      box('feeDisposition', 1, 205, 673, 190),
    ],
  },
];
