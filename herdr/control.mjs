import { createHash, timingSafeEqual } from "node:crypto";
import { createConnection } from "node:net";
import { readFile } from "node:fs/promises";
import { configHome, controlChannel, lockPath, ownerRecordPath } from "./paths.mjs";

export const config = configHome();
export const lock = lockPath(config);
export const recordPath = ownerRecordPath(config);
export const channel = controlChannel(config);

const matches = (a, b) => typeof a === "string" && timingSafeEqual(
  createHash("sha256").update(a).digest(),
  createHash("sha256").update(b).digest(),
);

export async function connectControl({ timeout = 3000, initialCommand } = {}) {
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  const socket = createConnection(channel);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => socket.destroy(new Error("Helper control timeout")), timeout);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.write(JSON.stringify({ token: record.token, ...(typeof initialCommand === "string" ? { command: initialCommand } : {}) }) + "\n");
      resolve();
    });
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
  return socket;
}

export { matches };
