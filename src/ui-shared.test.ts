// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { linkText, sourcesSection } from './ui-shared.ts';

// SPEC-v4 #36：來源連結文字改為網域加 ↗，href 不變。
describe('linkText', () => {
  it('顯示網域並去掉 www.', () => {
    expect(linkText('https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip')).toBe('unicode.org ↗');
    expect(linkText('https://github.com/cjkvi/cjkvi-ids')).toBe('github.com ↗');
  });

  it('網址無效時不猜網域', () => {
    expect(linkText('not a url')).toBe('來源連結 ↗');
    expect(linkText('')).toBe('來源連結 ↗');
  });
});

describe('sourcesSection 連結', () => {
  it('href 保留完整網址，連結文字不含上游檔名', () => {
    const html = sourcesSection('naming');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = [...doc.querySelectorAll<HTMLAnchorElement>('#sources a')];
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((a) => a.getAttribute('href') === 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip')).toBe(true);
    for (const a of links) {
      expect(a.textContent).toMatch(/ ↗$/);
      expect(a.textContent).not.toMatch(/\.(txt|zip|csv)\b/);
      expect(a.getAttribute('aria-label')).toContain(a.textContent!.replace(' ↗', ''));
    }
  });
});

// SPEC-v4 #40：資料來源預設收合，摘要列的項數由實際列數算出。
describe('sourcesSection 收合', () => {
  it.each(['analysis', 'naming'] as const)('%s 模式預設收合，摘要列項數等於列數', (mode) => {
    const doc = new DOMParser().parseFromString(sourcesSection(mode), 'text/html');
    const details = doc.querySelector<HTMLDetailsElement>('#sources details.sources-toggle')!;
    expect(details).not.toBeNull();
    expect(details.hasAttribute('open')).toBe(false);
    const count = details.querySelectorAll('dl.sources > dt').length;
    expect(count).toBeGreaterThan(0);
    expect(details.querySelector('summary')!.textContent!.trim()).toBe(`資料來源（${count} 項）`);
  });
});
