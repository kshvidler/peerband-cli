/**
 * Spaces and tabs for herdr-core. Core only runs terminals; the Herdr desktop app keeps each machine's
 * spaces, tabs and splits in a core document named `herdr-app` ({spaces: [{id, name, folder, tabs:
 * [{id, name, root}]}]}, where `root` is a tree of layout nodes and a terminal block names its terminal
 * address). The format belongs to the app, so this reader is deliberately loose: it only needs ids, names
 * and which terminal addresses each tab shows, and it ignores anything it does not recognise.
 */

export const LAYOUT_DOC = 'herdr-app';

export interface CoreSpace { id: string; label: string | null; number: number; tabs: CoreTab[] }
export interface CoreTab { id: string; spaceId: string; label: string | null; number: number; terminals: string[] }
export interface CoreLayout { spaces: CoreSpace[]; byTerminal: Map<string, { space: CoreSpace; tab: CoreTab }> }

/** Terminals that no tab shows (for example agents started with `hc run --bg`) are grouped here. */
export const BACKGROUND_SPACE_ID = 'hc-background';
export const BACKGROUND_TAB_ID = 'hc-background-tab';
export const BACKGROUND_SPACE_LABEL = 'Background';
export const BACKGROUND_TAB_LABEL = 'Not in a tab';

/** A local terminal address: `t` and a base-36 number (`t7`, `t1b`); remote ones look like `box/t3`. */
export const LOCAL_ADDRESS = /^t[0-9a-z]{1,12}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,255}$/;
const MAX_NODES = 10_000;

export const emptyLayout = (): CoreLayout => ({ spaces: [], byTerminal: new Map() });

/** Labels are user text from the machine: strip control characters and bound the length. */
export function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const label = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, 128);
  return label || null;
}

function folderName(folder: unknown): string | null {
  if (typeof folder !== 'string') return null;
  const parts = folder.split(/[\\/]/).filter(Boolean);
  return cleanLabel(parts[parts.length - 1]);
}

function addTerminal(content: unknown, found: string[]): void {
  const terminal = content && typeof content === 'object' ? (content as { terminal?: unknown }).terminal : undefined;
  if (typeof terminal === 'string' && LOCAL_ADDRESS.test(terminal) && !found.includes(terminal)) found.push(terminal);
}

/**
 * Every local terminal address a layout node shows, in tree order. Only a block's content counts (a mod's
 * props may mention terminals it does not show); `row`, `column` and `stack` nodes hold children, and any node
 * can carry floating blocks (`{content}`, or `{pane: node}` in newer builds).
 */
function terminalsIn(node: unknown, found: string[], budget: { left: number }): void {
  if (budget.left-- <= 0 || !node || typeof node !== 'object' || Array.isArray(node)) return;
  const value = node as Record<string, unknown>;
  if (value.type === 'block') addTerminal(value.content, found);
  if (Array.isArray(value.children)) for (const child of value.children) terminalsIn(child, found, budget);
  if (Array.isArray(value.floating)) {
    for (const float of value.floating) {
      if (!float || typeof float !== 'object') continue;
      addTerminal((float as { content?: unknown }).content, found);
      terminalsIn((float as { pane?: unknown }).pane, found, budget);
    }
  }
}

export function parseLayout(value: unknown): CoreLayout {
  const layout = emptyLayout();
  if (!value || typeof value !== 'object' || !Array.isArray((value as { spaces?: unknown }).spaces)) return layout;
  const budget = { left: MAX_NODES };
  for (const raw of (value as { spaces: unknown[] }).spaces) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== 'string' || !ID.test(row.id) || row.id === BACKGROUND_SPACE_ID) continue;
    // An unnamed space follows its folder in the app, so show the folder's name.
    const space: CoreSpace = { id: row.id, label: cleanLabel(row.name) ?? folderName(row.folder), number: layout.spaces.length + 1, tabs: [] };
    for (const rawTab of Array.isArray(row.tabs) ? row.tabs : []) {
      if (!rawTab || typeof rawTab !== 'object') continue;
      const tabRow = rawTab as Record<string, unknown>;
      if (typeof tabRow.id !== 'string' || !ID.test(tabRow.id)) continue;
      const terminals: string[] = [];
      terminalsIn(tabRow.root, terminals, budget);
      // Tabs can also float blocks over the whole tab.
      terminalsIn({ floating: tabRow.floating }, terminals, budget);
      const tab: CoreTab = { id: tabRow.id, spaceId: space.id, label: cleanLabel(tabRow.name), number: space.tabs.length + 1, terminals };
      space.tabs.push(tab);
      for (const address of terminals) if (!layout.byTerminal.has(address)) layout.byTerminal.set(address, { space, tab });
    }
    layout.spaces.push(space);
  }
  return layout;
}
