import { TELEGRAM_MATRIX, TELEGRAM_URL } from "./telegram-qr.mjs";

export { TELEGRAM_URL };
export const CHANNELS_URL = "https://peerband.com/dashboard#channels";

// Two modules per character, with the standard four-module quiet zone.
// Light modules are solid foreground; dark modules show the terminal background.
export function telegramQr() {
  const size = TELEGRAM_MATRIX.length + 8;
  const dark = (row, col) => TELEGRAM_MATRIX[row - 4]?.[col - 4] === "1";
  const lines = [];
  for (let row = 0; row < size; row += 2) {
    let line = "";
    for (let col = 0; col < size; col++) {
      const top = dark(row, col);
      const bottom = dark(row + 1, col);
      line += top ? (bottom ? " " : "▄") : (bottom ? "▀" : "█");
    }
    lines.push(line);
  }
  return lines;
}

export function renderTelegram({ version = "", columns = Infinity, rows = Infinity } = {}) {
  const qr = telegramQr();
  const showQr = columns >= qr[0].length && rows >= qr.length + 5;
  const lines = [
    `PeerBand${version ? ` v${version}` : ""} · Connect Telegram`,
    "Esc / t / Enter  back to relay",
    TELEGRAM_URL,
    "Open bot, press Start, then Connect.",
    ...(showQr ? qr : ["Enlarge pane for QR, or open the link."]),
    CHANNELS_URL,
  ];
  return lines.slice(0, Math.max(1, rows)).map((line) => Array.from(line).slice(0, columns).join("")).join("\n");
}
