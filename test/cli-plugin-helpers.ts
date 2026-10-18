import { EventEmitter } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReadableLike } from '../src/cli/types.js';
import { fakeHerdr, tempDir } from './cli-helpers.js';

/** Version the CLI claims in plugin-check tests, so expected `@v...` refs do not depend on the build. */
export const TEST_VERSION = '9.9.9';

/** A stdin that answers one prompt with `answer`. */
export function fakeStdin(answer: string): ReadableLike & { isTTY: boolean } {
  const emitter = new EventEmitter();
  return {
    isTTY: true,
    resume() {
      setImmediate(() => emitter.emit('data', answer));
    },
    pause() {},
    on: (event, listener) => emitter.on(event, listener),
    off: (event, listener) => emitter.off(event, listener),
  };
}

/**
 * Stateful fake Herdr with the PeerBand plugin in `source` (null = not installed). `install`/`link`/`uninstall` change it,
 * so a repair can be observed. `plugin config-dir` points at `configDir`.
 */
export function stubPlugin(configDir: string, source: string | null) {
  let current = source;
  const fake = fakeHerdr((args) => {
    const command = args.slice(0, 2).join(' ');
    if (args[0] === '--version') return { stdout: 'herdr 0.9.3\n' };
    if (command === 'plugin list') return { stdout: current ? `- peerband (PeerBand) enabled [${current}]\n` : '- other (Other) enabled [local:/y]\n' };
    if (command === 'plugin install') current = `github:${args[2]}@${args[args.indexOf('--ref') + 1]}`;
    if (command === 'plugin link') current = `local:${args[2]}`;
    if (command === 'plugin uninstall' || command === 'plugin unlink') current = null;
    if (command === 'plugin config-dir') return { stdout: `${configDir}\n` };
    return undefined;
  });
  return { ...fake, source: () => current };
}

/** Writes the plugin's settings.json as `peerband herdr install` would. */
export async function writePluginSettings(configDir: string, settings: Record<string, unknown>): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, 'settings.json'), JSON.stringify(settings));
}

export const releaseSource = (version = TEST_VERSION) => `github:kshvidler/peerband-cli@v${version}`;

/** A plugin in `source` whose settings point at `home` and at this process's Node. */
export async function pluginFor(home: string, source: string | null = releaseSource(), settings: Record<string, unknown> = {}) {
  const configDir = join(await tempDir('peerband-plugin-'), 'cfg');
  await writePluginSettings(configDir, { nodePath: process.execPath, configHome: home, ...settings });
  return { configDir, herdr: stubPlugin(configDir, source) };
}
