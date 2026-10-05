import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('styles.css', 'utf8');

describe('mobile Safari text-entry stability', () => {
  it('keeps browser zoom available instead of disabling it as a workaround', () => {
    const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? '';
    expect(viewport).toContain('width=device-width');
    expect(viewport).not.toContain('user-scalable=no');
    expect(viewport).not.toMatch(/maximum-scale\s*=\s*1/);
  });

  it('keeps prompt text input at the iOS focus-safe font size', () => {
    const rule = css.match(/\.ask-input\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/font-size\s*:\s*16px/);
  });
});
