import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Credentials } from '../core/index.js';
import { installationCall } from './commands/shared.js';
import { sanitize } from './output.js';
import { CliError, type Ctx, UsageError } from './types.js';

/** At most this many files per note (the server enforces the same limit). */
export const MAX_ATTACHMENTS = 5;
/** The largest file the CLI tries to upload; the account's plan may allow less (the server says so). */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const NO_ATTACHMENT_SUPPORT = 'This PeerBand server does not support file attachments yet. The note was not sent.';

const TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.log': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.json': 'application/json',
  '.yaml': 'application/yaml', '.yml': 'application/yaml', '.xml': 'application/xml', '.html': 'text/html', '.diff': 'text/x-diff', '.patch': 'text/x-diff',
  '.zip': 'application/zip', '.gz': 'application/gzip', '.tgz': 'application/gzip', '.tar': 'application/x-tar',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** A best-effort media type from the file name; the server checks the bytes itself. */
export function contentTypeFor(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export interface LocalFile {
  path: string;
  name: string;
  size: number;
  contentType: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  contentType: string;
  kind: string;
  url: string | null;
  urlExpiresAt: string | null;
}

export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Checks every path before anything is uploaded: it exists, is a regular file, and is not empty or too large. */
export async function checkFiles(paths: string[]): Promise<LocalFile[]> {
  if (paths.length > MAX_ATTACHMENTS) throw new UsageError(`At most ${MAX_ATTACHMENTS} files per note.`, 'Send the rest in another note, or put them in one archive.');
  const files: LocalFile[] = [];
  for (const path of paths) {
    let info;
    try {
      info = await stat(path);
    } catch {
      throw new UsageError(`There is no file at ${sanitize(path)}.`, 'Check the path; relative paths start from the current directory.');
    }
    if (!info.isFile()) throw new UsageError(`${sanitize(path)} is not a file.`, 'Attach files, not folders; put a folder in an archive first.');
    if (info.size === 0) throw new UsageError(`${sanitize(path)} is empty.`);
    if (info.size > MAX_FILE_BYTES) throw new UsageError(`${sanitize(path)} is ${formatSize(info.size)}; PeerBand takes files up to ${formatSize(MAX_FILE_BYTES)}.`, 'Share a smaller file, or a link to it.');
    files.push({ path, name: basename(path), size: info.size, contentType: contentTypeFor(path) });
  }
  if (new Set(files.map((file) => file.path)).size !== files.length) throw new UsageError('The same file is attached twice.');
  return files;
}

function uploaded(raw: unknown): UploadedFile {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof item.id !== 'string' || !/^att_[A-Za-z0-9_-]{20,40}$/.test(item.id)) throw new CliError('PeerBand sent an unexpected attachment.', 'Try again; run `peerband update` if it keeps happening.');
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? sanitize(value).slice(0, 2048) : fallback);
  return {
    id: item.id,
    name: text(item.name, 'file'),
    size: typeof item.size === 'number' ? item.size : 0,
    contentType: text(item.contentType, 'application/octet-stream'),
    kind: text(item.kind, 'file'),
    url: typeof item.url === 'string' && /^https?:\/\//.test(item.url) ? item.url : null,
    urlExpiresAt: typeof item.urlExpiresAt === 'string' ? item.urlExpiresAt : null,
  };
}

/**
 * Uploads one file: PeerBand authorises it (size, type, SHA-256), the bytes go straight to its file storage with the
 * returned URL and headers, then PeerBand checks the stored file and makes it ready.
 */
export async function uploadFile(ctx: Ctx, credentials: Credentials, file: LocalFile, agentId?: string): Promise<UploadedFile> {
  const data = await readFile(file.path);
  if (data.length !== file.size) throw new CliError(`${sanitize(file.path)} changed while it was being read.`, 'Try again once it is no longer being written.');
  const sha256 = createHash('sha256').update(data).digest('hex');
  const created = (await installationCall(ctx, credentials, 'POST', '/api/installation/attachments', {
    filename: file.name, size: file.size, contentType: file.contentType, sha256, ...(agentId ? { agentId } : {}),
  }, NO_ATTACHMENT_SUPPORT)) as { attachment?: unknown; upload?: { url?: unknown; method?: unknown; headers?: unknown } } | null;
  const attachment = uploaded(created?.attachment);
  const upload = created?.upload;
  if (!upload || typeof upload.url !== 'string' || !/^https?:\/\//.test(upload.url)) throw new CliError('PeerBand sent no upload address.', 'Try again; run `peerband update` if it keeps happening.');
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(upload.headers && typeof upload.headers === 'object' ? upload.headers : {})) {
    if (typeof value === 'string') headers[key] = value;
  }
  let response: Response;
  try {
    response = await ctx.fetch(upload.url, { method: typeof upload.method === 'string' ? upload.method : 'PUT', headers, body: data, signal: AbortSignal.timeout(10 * 60_000) });
  } catch (error) {
    await discard(ctx, credentials, attachment.id);
    throw new CliError(`Uploading ${sanitize(file.name)} failed: ${sanitize((error as Error).message)}`, 'Check your network connection and try again.');
  }
  if (!response.ok) {
    await discard(ctx, credentials, attachment.id);
    throw new CliError(`Uploading ${sanitize(file.name)} failed (HTTP ${response.status}).`, 'Try again. If it keeps failing, check `peerband status`.');
  }
  const done = (await installationCall(ctx, credentials, 'POST', `/api/installation/attachments/${attachment.id}/complete`, {})) as { attachment?: unknown } | null;
  return uploaded(done?.attachment);
}

/** Removes uploads that will not be sent (best effort; unsent files also expire on their own). */
export async function discard(ctx: Ctx, credentials: Credentials, id: string): Promise<void> {
  try {
    await installationCall(ctx, credentials, 'DELETE', `/api/installation/attachments/${id}`);
  } catch {
    // The server removes abandoned uploads after an hour.
  }
}
