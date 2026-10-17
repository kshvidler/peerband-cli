import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { cleanupAll, runCli, tempDir } from './cli-helpers.js';
import { controlChannel, ownerRecordPath } from '../src/cli/herdr-js.js';

afterEach(cleanupAll);

describe('control channel name', () => {
  it('is the same for every spelling of the same config folder', () => {
    const win = (p: string) => controlChannel(p, 'win32');
    expect(win('C:/Users/a/Temp/pb/config')).toBe(win('C:\\Users\\a\\Temp\\pb\\config'));
    expect(win('C:\\Users\\a\\Temp\\pb\\config\\')).toBe(win('c:\\users\\A\\temp\\PB\\config'));
    const posix = (p: string) => controlChannel(p, 'linux');
    expect(posix('/home/a/.config/peerband/')).toBe(posix('/home/a/.config/peerband'));
    expect(posix('/home/a/.config/peerband')).not.toBe(posix('/home/a/.config/Peerband'));
  });
});

describe('relay status over the control channel', () => {
  it('normalises a live status reply instead of forcing helper-unavailable', async () => {
    const home = await tempDir();
    await mkdir(join(home, 'relay-helper.lock'), { recursive: true });
    await writeFile(ownerRecordPath(home), JSON.stringify({ token: 'secret-token' }));
    const channel = controlChannel(home);
    const received: unknown[] = [];
    const server = createServer((socket) => {
      let text = '';
      socket.on('data', (chunk) => {
        text += chunk.toString();
        if (!text.includes('\n')) return;
        received.push(JSON.parse(text.slice(0, text.indexOf('\n'))));
        socket.end(`${JSON.stringify({ state: 'running', connectionState: 'connected', activity: [] })}\n`);
      });
    });
    await new Promise<void>((resolve, reject) => server.once('error', reject).listen(channel, resolve));
    try {
      const result = await runCli(['status', '--json'], { env: { PEERBAND_CONFIG_HOME: home } });
      const report = JSON.parse(result.stdout);
      expect(report.relay).toEqual({ running: true, connection: 'connected', source: 'control' });
      expect(received).toEqual([{ token: 'secret-token', command: 'status' }]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await rm(channel, { force: true });
    }
  });
});
