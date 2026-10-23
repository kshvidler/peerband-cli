import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JS plugin module without type declarations
import { createRelayTabController, describeHerdrFailure, openRelayTab, parseHerdrCommandOutput } from '../herdr/relay-tab.mjs';

const dirs: string[] = [];
async function temporaryState() {
  const dir = await mkdtemp(join(tmpdir(), 'peerband-relay-tab-'));
  dirs.push(dir);
  return join(dir, 'relay-tab.json');
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('relay tab ownership', () => {

  it('adopts and focuses an already-open marked Relay pane instead of opening a duplicate when the record is gone', async () => {
    const statePath = await temporaryState();
    const commands: string[][] = [];
    const pane = { pane_id: 'w1:p7', tab_id: 'w1:t7', workspace_id: 'w1', label: 'PeerBand Relay [On]', tokens: { peerband_relay: 'old-marker' } };
    const run = async (args: string[]) => {
      commands.push(args);
      if (args[0] === 'pane' && args[1] === 'list') return { panes: [{ pane_id: 'w1:p1', tab_id: 'w1:t1' }, pane] };
      if (args[0] === 'pane' && args[1] === 'get') return { pane };
      return {};
    };
    const controller = createRelayTabController({ run, statePath, newMarker: () => 'new-marker' });
    await expect(controller.open()).resolves.toBe('w1:p7');
    expect(commands.some((args) => args[0] === 'plugin' && args[2] === 'open')).toBe(false);
    expect(commands).toContainEqual(['plugin', 'pane', 'focus', 'w1:p7']);
    expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({ version: 1, paneId: 'w1:p7', marker: 'old-marker' });
    // The adopted record now verifies directly, without another list.
    commands.length = 0;
    await expect(controller.open()).resolves.toBe('w1:p7');
    expect(commands[0]).toEqual(['pane', 'get', 'w1:p7']);
  });
  it('accepts successful action output without weakening pane-data validation', () => {
    expect(parseHerdrCommandOutput('', ['tab', 'rename', 'w1:t1', 'PeerBand Relay [Off]'])).toEqual({});
    expect(parseHerdrCommandOutput('Updated tab', ['tab', 'rename', 'w1:t1', 'PeerBand Relay [Off]'])).toEqual({});
    expect(parseHerdrCommandOutput('null', ['pane', 'report-metadata', 'w1:p1'])).toEqual({});
    expect(() => parseHerdrCommandOutput('', ['pane', 'get', 'w1:p1'])).toThrow('invalid JSON');
    expect(() => parseHerdrCommandOutput('ok', ['plugin', 'pane', 'open'])).toThrow('invalid JSON');
    expect(() => parseHerdrCommandOutput('{"ok":false,"error":{"message":"Not allowed"}}', ['tab', 'rename'])).toThrow('Not allowed');
  });

  it('keeps a verified new relay pane open when its initial title update fails', async () => {
    const statePath = await temporaryState();
    const commands: string[][] = [];
    const warnings: string[] = [];
    const pane = { pane_id: 'w1:p-new', tab_id: 'w1:t-new', workspace_id: 'w1', tokens: {} as Record<string, string> };
    const run = async (args: string[]) => {
      commands.push(args);
      if (args[0] === 'plugin' && args[2] === 'open') return { plugin_pane: { plugin_id: 'peerband', entrypoint: 'relay', pane } };
      if (args[0] === 'pane' && args[1] === 'list') return { panes: [pane] };
      if (args[0] === 'tab' && args[1] === 'rename') throw new Error('Title update unavailable');
      if (args[0] === 'pane' && args[1] === 'report-metadata') pane.tokens.peerband_relay = 'verified-marker';
      if (args[0] === 'pane' && args[1] === 'get') return { pane };
      return {};
    };
    const controller = createRelayTabController({ run, statePath, newMarker: () => 'verified-marker', warn: (text: string) => warnings.push(text) });
    await expect(controller.open()).resolves.toBe(pane.pane_id);
    expect(warnings[0]).toContain('Title update unavailable');
    expect(commands.some((args) => args[0] === 'plugin' && args[2] === 'close')).toBe(false);
    expect(pane.tokens.peerband_relay).toBe('verified-marker');
  });

  it('completes launch when rename and metadata commands acknowledge success with empty stdout', async () => {
    const statePath = await temporaryState();
    const commands: string[][] = [];
    const pane = { pane_id: 'w1:p-new', tab_id: 'w1:t-new', workspace_id: 'w1', tokens: {} as Record<string, string> };
    const run = async (args: string[]) => {
      commands.push(args);
      let result;
      if (args[0] === 'plugin' && args[2] === 'open') result = { plugin_pane: { plugin_id: 'peerband', entrypoint: 'relay', pane } };
      if (args[0] === 'pane' && args[1] === 'list') result = { panes: [pane] };
      if (args[0] === 'pane' && args[1] === 'report-metadata') pane.tokens.peerband_relay = 'verified-marker';
      if (args[0] === 'pane' && args[1] === 'get') result = { pane };
      return parseHerdrCommandOutput(result ? JSON.stringify({ ok: true, result }) : '', args);
    };
    const controller = createRelayTabController({ run, statePath, newMarker: () => 'verified-marker' });
    await expect(controller.open()).resolves.toBe(pane.pane_id);
    expect(commands.some((args) => args[0] === 'plugin' && args[2] === 'close')).toBe(false);
    expect(JSON.parse(await readFile(statePath, 'utf8')).paneId).toBe(pane.pane_id);
  });

  it('opens a plugin pane in a tab, validates the response, persists a marker, and titles its single-pane tab', async () => {
    const statePath = await temporaryState();
    const commands: string[][] = [];
    const pane = { pane_id: 'w1:p9', tab_id: 'w1:t9', workspace_id: 'w1', tokens: { peerband_relay: 'random-marker' } };
    const run = async (args: string[]) => {
      commands.push(args);
      if (args[0] === 'plugin' && args[1] === 'pane' && args[2] === 'open') { opened = true; return { plugin_pane: { plugin_id: 'peerband', entrypoint: 'relay', pane: { ...pane, tokens: {} } } }; }
      if (args[0] === 'pane' && args[1] === 'report-metadata') return { type: 'pane_metadata_reported' };
      if (args[0] === 'pane' && args[1] === 'get') return { pane };
      if (args[0] === 'pane' && args[1] === 'list') return { panes: opened ? [pane] : [] };
      return {};
    };
    let opened = false;
    const controller = createRelayTabController({ run, statePath, newMarker: () => 'random-marker' });

    await expect(controller.open()).resolves.toBe('w1:p9');
    const record = JSON.parse(await readFile(statePath, 'utf8'));
    expect(record).toEqual({ version: 1, paneId: 'w1:p9', marker: 'random-marker' });
    expect(commands[0]).toEqual(['pane', 'list']);
    expect(commands[1]).toEqual(['plugin', 'pane', 'open', '--plugin', 'peerband', '--entrypoint', 'relay', '--placement', 'tab', '--focus']);
    expect(commands.some((args) => args[0] === 'pane' && args[1] === 'report-metadata' && args.includes('peerband_relay=random-marker'))).toBe(true);
    expect(commands).toContainEqual(['tab', 'rename', 'w1:t9', 'PeerBand Relay [Off]']);
    expect(commands.findIndex((args) => args[0] === 'tab' && args[1] === 'rename'))
      .toBeLessThan(commands.findIndex((args) => args[0] === 'pane' && args[1] === 'report-metadata'));
    const opensBeforeReuse = commands.filter((args) => args[0] === 'plugin' && args[1] === 'pane' && args[2] === 'open').length;
    await expect(controller.open()).resolves.toBe('w1:p9');
    expect(commands.filter((args) => args[0] === 'plugin' && args[1] === 'pane' && args[2] === 'open')).toHaveLength(opensBeforeReuse);
    expect(commands).toContainEqual(['plugin', 'pane', 'focus', 'w1:p9']);
    await expect(access(`${statePath}.launch-lock`)).rejects.toThrow();
  });

  it('reuses and focuses a pane only when its random marker still matches', async () => {
    const statePath = await temporaryState();
    await writeFile(statePath, JSON.stringify({ version: 1, paneId: 'w1:p3', marker: 'owned-random' }));
    const commands: string[][] = [];
    const run = async (args: string[]) => {
      commands.push(args);
      if (args[0] === 'pane' && args[1] === 'get') return { pane: { pane_id: 'w1:p3', tab_id: 'w1:t3', workspace_id: 'w1', tokens: { peerband_relay: 'owned-random' } } };
      if (args[0] === 'pane' && args[1] === 'list') return { panes: [{ pane_id: 'w1:p3', tab_id: 'w1:t3' }] };
      return {};
    };
    const controller = createRelayTabController({ run, statePath, pluginPaneId: 'w1:p7' });

    await expect(controller.open()).resolves.toBe('w1:p3');
    expect(commands).toContainEqual(['plugin', 'pane', 'focus', 'w1:p3']);
    expect(commands.some((args) => args[0] === 'plugin' && args[2] === 'open')).toBe(false);
  });

  it('does not touch a stale pane and creates a new one with a fresh marker', async () => {
    const statePath = await temporaryState();
    await writeFile(statePath, JSON.stringify({ version: 1, paneId: 'w1:p4', marker: 'old-random' }));
    const commands: string[][] = [];
    const fresh = { pane_id: 'w1:p5', tab_id: 'w1:t5', workspace_id: 'w1', tokens: {} as Record<string, string> };
    let getCount = 0;
    const run = async (args: string[]) => {
      commands.push(args);
      if (args[0] === 'pane' && args[1] === 'get') { if (++getCount === 1) throw new Error('pane not found'); return { pane: fresh }; }
      if (args[0] === 'plugin' && args[1] === 'pane' && args[2] === 'open') return { plugin_pane: { plugin_id: 'peerband', entrypoint: 'relay', pane: { ...fresh, tokens: {} } } };
      if (args[0] === 'pane' && args[1] === 'report-metadata') { fresh.tokens.peerband_relay = 'new-random'; return { type: 'pane_metadata_reported' }; }
      if (args[0] === 'pane' && args[1] === 'list') return { panes: [fresh] };
      return {};
    };

    const controller = createRelayTabController({ run, statePath, newMarker: () => 'new-random' });
    await expect(controller.open()).resolves.toBe('w1:p5');
    expect(commands.some((args) => args[0] === 'plugin' && args[1] === 'pane' && args[2] === 'close')).toBe(false);
    expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({ version: 1, paneId: 'w1:p5', marker: 'new-random' });
  });

  it('renames only the current owned pane tab and only while it has that one pane', async () => {
    const statePath = await temporaryState();
    await writeFile(statePath, JSON.stringify({ version: 1, paneId: 'w1:p6', marker: 'mark' }));
    let panes = [{ pane_id: 'w1:p6', tab_id: 'w1:t-moved', workspace_id: 'w1' }];
    const commands: string[][] = [];
    const run = async (args: string[]) => {
      commands.push(args);
      if (args[0] === 'pane' && args[1] === 'get') return { pane: { pane_id: 'w1:p6', tab_id: 'w1:t-moved', workspace_id: 'w1', tokens: { peerband_relay: 'mark' } } };
      if (args[0] === 'pane' && args[1] === 'list') return { panes };
      return {};
    };
    const controller = createRelayTabController({ run, statePath, pluginPaneId: 'w1:p6' });

    await expect(controller.sync(true)).resolves.toBe(true);
    expect(commands).toContainEqual(['tab', 'rename', 'w1:t-moved', 'PeerBand Relay [On]']);
    commands.length = 0;
    panes = [panes[0]!, { pane_id: 'w1:p-other', tab_id: 'w1:t-moved', workspace_id: 'w1' }];
    await expect(controller.sync(false)).resolves.toBe(false);
    expect(commands.some((args) => args[0] === 'tab' && args[1] === 'rename')).toBe(false);
  });

  it('does not close a pane whose ownership marker no longer matches', async () => {
    const statePath = await temporaryState();
    await writeFile(statePath, JSON.stringify({ version: 1, paneId: 'w1:p7', marker: 'owned' }));
    const commands: string[][] = [];
    const run = async (args: string[]) => {
      commands.push(args);
      return { pane: { pane_id: 'w1:p7', tokens: { peerband_relay: 'different-owner' } } };
    };
    const controller = createRelayTabController({ run, statePath, pluginPaneId: 'w1:p7' });

    await expect(controller.close()).resolves.toBe(false);
    expect(commands.some((args) => args[0] === 'plugin' && args[1] === 'pane' && args[2] === 'close')).toBe(false);
  });

  it('closes only the caller pane after matching the ownership marker', async () => {
    const statePath = await temporaryState();
    await writeFile(statePath, JSON.stringify({ version: 1, paneId: 'w1:p8', marker: 'owned' }));
    const commands: string[][] = [];
    const run = async (args: string[]) => {
      commands.push(args);
      if (args[0] === 'pane' && args[1] === 'get') return { pane: { pane_id: 'w1:p8', tokens: { peerband_relay: 'owned' } } };
      return {};
    };
    const staleUi = createRelayTabController({ run, statePath, pluginPaneId: 'w1:p-old' });
    await expect(staleUi.close()).resolves.toBe(false);
    expect(commands).toHaveLength(0);
    const controller = createRelayTabController({ run, statePath, pluginPaneId: 'w1:p8' });

    await expect(controller.close()).resolves.toBe(true);
    expect(commands).toContainEqual(['plugin', 'pane', 'close', 'w1:p8']);
  });

  it('exports openRelayTab for the CLI and honours injected options', async () => {
    const statePath = await temporaryState();
    const pane = { pane_id: 'w1:p1', tab_id: 'w1:t1', workspace_id: 'w1', tokens: {} as Record<string, string> };
    const run = async (args: string[]) => {
      if (args[0] === 'plugin' && args[2] === 'open') return { plugin_pane: { plugin_id: 'peerband', entrypoint: 'relay', pane } };
      if (args[0] === 'pane' && args[1] === 'report-metadata') pane.tokens.peerband_relay = 'm';
      if (args[0] === 'pane' && args[1] === 'get') return { pane };
      if (args[0] === 'pane' && args[1] === 'list') return { panes: [pane] };
      return {};
    };
    await expect(openRelayTab({ run, statePath, newMarker: () => 'm' })).resolves.toBe('w1:p1');
  });

  it('turns launch failures into actionable messages', () => {
    const missing = Object.assign(new Error('spawn herdr ENOENT'), { code: 'ENOENT' });
    expect(describeHerdrFailure(missing, 'herdr')).toMatch(/HERDR_BIN_PATH/);
    const notInstalled = Object.assign(new Error('failed'), { stderr: 'plugin not found: peerband' });
    expect(describeHerdrFailure(notInstalled)).toContain('peerband herdr install');
    expect(describeHerdrFailure(Object.assign(new Error('x'), { stderr: 'boom[2J' }))).toBe('boom');
  });

  it('refuses to open when the plugin pane response is for another plugin', async () => {
    const statePath = await temporaryState();
    const run = async (args: string[]) => (args[0] === 'plugin' && args[2] === 'open'
      ? { plugin_pane: { plugin_id: 'other', entrypoint: 'relay', pane: { pane_id: 'w1:p1' } } }
      : {});
    await expect(createRelayTabController({ run, statePath }).open()).rejects.toThrow('expected plugin pane');
  });
});
