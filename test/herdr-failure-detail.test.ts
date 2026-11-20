import { describe, expect, it } from 'vitest';
import { failureDetail } from '../src/cli/herdr-bin.js';
import { RETRYABLE } from '../src/cli/plugin-replace.js';

describe('failureDetail', () => {
  it('leads with the error line after a long plugin install preview, so a busy file is retried', () => {
    const preview = ['Plugin install preview:', '  id: peerband', ...Array.from({ length: 30 }, (_, i) => `    action a${i}: node herdr/launch.mjs lifecycle start`)].join('\n');
    const stderr = `${preview}\nError: Os { code: 32, kind: Uncategorized, message: "The process cannot access the file because it is being used by another process." }\n`;
    const detail = failureDetail({ code: 1, stdout: '', stderr });
    expect(detail).toMatch(/^Error: Os \{ code: 32/);
    expect(RETRYABLE.test(detail)).toBe(true);
  });

  it('keeps plain text and JSON errors as before', () => {
    expect(failureDetail({ code: 1, stdout: '', stderr: 'something broke' })).toBe('something broke');
    expect(failureDetail({ code: 1, stdout: '{"error":{"message":"bad ref"}}', stderr: '' })).toBe('bad ref');
  });
});
