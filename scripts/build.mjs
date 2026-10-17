import { build } from 'esbuild';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const outfile = resolve(root, 'dist', 'peerband.mjs');

await build({
  entryPoints: [resolve(root, 'src/cli/main.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['bufferutil', 'utf-8-validate'],
  define: { __PEERBAND_VERSION__: JSON.stringify(pkg.version) },
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as pbCreateRequire } from 'node:module'; const require = pbCreateRequire(import.meta.url);",
  },
  logLevel: 'warning',
});
// esbuild keeps a leading hashbang from the entry file; make sure there is exactly one.
const text = await readFile(outfile, 'utf8');
const deduped = text.replace(/^(#!\/usr\/bin\/env node\r?\n)(#!\/usr\/bin\/env node\r?\n)+/, '$1');
if (deduped !== text) await writeFile(outfile, deduped);
await chmod(outfile, 0o755);
console.log(`Built dist/peerband.mjs (v${pkg.version}).`);
