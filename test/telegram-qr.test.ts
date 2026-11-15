import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
// @ts-expect-error -- generated plain JS matrix for the standalone Herdr plugin
import { TELEGRAM_MATRIX, TELEGRAM_URL } from '../herdr/telegram-qr.mjs';
// @ts-expect-error -- shared plain JS plugin renderer
import { telegramQr } from '../herdr/telegram.mjs';

it('keeps the generated matrix in sync with the public bot URL and preserves its quiet zone', () => {
  const require = createRequire(import.meta.url);
  const QRCode = require('qrcode-terminal/vendor/QRCode') as new (version: number, level: number) => {
    addData(text: string): void; make(): void; modules: boolean[][];
  };
  const qr = new QRCode(-1, 1); // qrcode-terminal's low error-correction level
  qr.addData(TELEGRAM_URL);
  qr.make();
  expect(TELEGRAM_URL).toBe('https://t.me/PeerBandBot');
  expect(qr.modules.map((row) => row.map(Number).join(''))).toEqual(TELEGRAM_MATRIX);

  const lines: string[] = telegramQr();
  const size = qr.modules.length + 8;
  expect(lines).toHaveLength(Math.ceil(size / 2));
  // Decode both half-block modules back to pixels to check the renderer, not just the matrix.
  const pixels = lines.flatMap((line) => {
    expect(Array.from(line)).toHaveLength(size);
    return [Array.from(line, (char) => char === ' ' || char === '▄'), Array.from(line, (char) => char === ' ' || char === '▀')];
  });
  for (let row = 0; row < pixels.length; row++) {
    for (let col = 0; col < size; col++) {
      expect(pixels[row]?.[col]).toBe(qr.modules[row - 4]?.[col - 4] ?? false);
    }
  }
});
