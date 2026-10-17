import type { ReadableLike, WritableLike } from './types.js';

export class PromptAborted extends Error {
  constructor() {
    super('Prompt cancelled.');
    this.name = 'PromptAborted';
  }
}

/** Reads one line from a TTY without echoing it. Handles Backspace, paste, Enter and Ctrl+C. */
export function readHidden(stdin: ReadableLike, stderr: WritableLike, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode?.(false);
      stdin.pause();
      stderr.write('\n');
    };
    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (let i = 0; i < text.length; i++) {
        const char = text[i]!;
        if (char === '\r' || char === '\n') {
          cleanup();
          return resolve(value);
        }
        if (char === '\u0003' || char === '\u0004') {
          cleanup();
          return reject(new PromptAborted());
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char === '\u001b') {
          // Skip an escape sequence such as an arrow key (ESC [ ... final byte).
          if (text[i + 1] === '[') {
            i += 2;
            while (i < text.length && !/[@-~]/.test(text[i]!)) i++;
          }
          continue;
        }
        if (char >= ' ') value += char;
      }
    };
    stderr.write(prompt);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}
