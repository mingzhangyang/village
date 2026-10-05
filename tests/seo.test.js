import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('index.html', 'utf8');

describe('public SEO surface', () => {
  it('publishes stable canonical and social metadata', () => {
    expect(html).toContain('<link rel="canonical" href="https://village.orangely.xyz/">');
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('property="og:image" content="https://village.orangely.xyz/og-image.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('keeps structured data machine-readable', () => {
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const data = JSON.parse(match[1]);
    expect(data).toMatchObject({
      '@type': 'WebApplication',
      name: '禾境',
      url: 'https://village.orangely.xyz/',
      applicationCategory: 'GameApplication',
      inLanguage: 'zh-CN',
      isAccessibleForFree: true,
    });
  });

  it('keeps discovery and install assets aligned', () => {
    const manifest = JSON.parse(readFileSync('public/site.webmanifest', 'utf8'));
    expect(manifest).toMatchObject({
      short_name: '禾境',
      start_url: './',
      theme_color: '#4F7136',
    });
    for (const file of [
      'public/favicon.svg',
      'public/logo.svg',
      'public/apple-touch-icon.png',
      'public/icon-192.png',
      'public/icon-512.png',
      'public/icon-maskable-512.png',
      'public/og-image.png',
      'public/robots.txt',
      'public/sitemap.xml',
    ]) {
      expect(existsSync(file), file).toBe(true);
    }
    expect(readFileSync('public/robots.txt', 'utf8')).toContain(
      'Sitemap: https://village.orangely.xyz/sitemap.xml',
    );
  });
});
