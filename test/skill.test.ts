import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

it('ships an agent skill with valid frontmatter, discoverable by `npx skills add`', async () => {
  const text = await readFile(resolve(import.meta.dirname, '..', 'skills', 'peerband', 'SKILL.md'), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  expect(match).not.toBeNull();
  const front = match![1]!;
  expect(front).toMatch(/^name: peerband$/m);
  const description = /^description: (.+)$/m.exec(front)?.[1] ?? '';
  expect(description.length).toBeGreaterThan(40);
  expect(description.length).toBeLessThanOrEqual(1024);
  for (const tool of ['list_agents', 'get_agent_status', 'get_agent_output', 'send_agent_message', 'get_request_status']) expect(text).toContain(tool);
  expect(text).toContain('https://mcp.peerband.com/mcp');
  expect(text).toContain('idempotency_key');
  expect(text).toMatch(/UNTRUSTED/);
});

it('teaches agents the exact relay headers the connector writes, with strict rules for shared users', async () => {
  const { relayMessageHeader } = await import('../src/core/index.js');
  const text = await readFile(resolve(import.meta.dirname, '..', 'skills', 'peerband', 'SKILL.md'), 'utf8');
  const description = /^description: (.+)$/m.exec(text)?.[1] ?? '';
  expect(description).toContain('[PeerBand relay]');
  const owner = relayMessageHeader({ id: 'o', scopes: [], role: 'owner' });
  const guest = relayMessageHeader({ id: 'g', scopes: [], role: 'guest', email: 'guest@example.com' });
  for (const header of [owner, guest]) expect(header.startsWith('[PeerBand relay] ')).toBe(true);
  expect(owner).toContain('From your user, the owner of this machine');
  expect(text).toContain('From your user, the owner of this machine');
  expect(guest).toContain('NOT the owner of this machine');
  expect(text).toContain('NOT the owner of this machine');
  expect(guest).toContain('guest rules in the peerband skill');
  expect(text).toMatch(/### From a shared user/);
  expect(text).toMatch(/Never disclose private information/);
  expect(text).toMatch(/Only the \*\*first line\*\* counts/);
  expect(text).toMatch(/### When the owner wants different rules/);
  expect(text).toContain('peerband skill --force');
});
