import { openRelayTab } from "./relay-tab.mjs";

try {
  await openRelayTab();
} catch (error) {
  const detail = String(error.message || "Unknown launch error").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, 500);
  process.stderr.write(`Could not open the PeerBand Relay tab: ${detail}\nRetry: peerband relay\n`);
  process.exitCode = 1;
}
