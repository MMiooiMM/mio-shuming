// SPEC-v4 #9、#10：名詞解釋集中在資料檔，每條都有出處。
import { describe, expect, it } from 'vitest';
import { GLOSSARY, glossaryOf } from './index.ts';

const REQUIRED = ['人格', '天格', '地格', '外格', '總格', '三才', '用神', '十神', '藏干', '真太陽時'];

describe('名詞解釋資料檔', () => {
  it.each(REQUIRED)('%s：有解釋文字，且 source 的原文摘錄與網址皆非空', (term) => {
    const entry = glossaryOf(term);
    expect(entry, `glossary 缺少「${term}」`).toBeDefined();
    expect(entry!.text.trim()).not.toBe('');
    expect(entry!.source.note.trim()).not.toBe('');
    expect(entry!.source.url).toMatch(/^https:\/\/\S+$/);
  });

  it('名詞不重複（UI 以名詞查表，重複會讓其中一條永遠讀不到）', () => {
    const terms = GLOSSARY.map((g) => g.term);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('用神的解釋明示各家判法不一、本站採自訂操作化規則（不寫成古籍定論）', () => {
    const text = glossaryOf('用神')!.text;
    expect(text).toContain('各家判法不一');
    expect(text).toContain('本站採自訂的操作化規則');
  });

  it('未收錄的名詞回 undefined，不臆造', () => {
    expect(glossaryOf('納音')).toBeUndefined();
  });
});
