export type ReceiptMime = 'image/jpeg' | 'image/png';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Tipo real de la imagen según sus *magic bytes*; no confía en el nombre ni en el Content-Type. */
export function detectImageType(data: Buffer): ReceiptMime | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (data.length >= 8 && PNG_SIGNATURE.every((byte, i) => data[i] === byte)) {
    return 'image/png';
  }
  return null;
}

export const RECEIPT_EXTENSION: Record<ReceiptMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
