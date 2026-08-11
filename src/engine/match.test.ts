import { describe, expect, it } from 'vitest';
import type { Element } from '../data/index.ts';
import {
  CHAR_WUXING_CONFLICTS,
  CHAR_WUXING_UNDECIDED,
  CHAR_WUXING_STATS,
  COMMON_CHARS,
  charElementOf,
  isCommonChar,
  kangxiStrokeCount,
} from '../data/index.ts';
import { matchName, recommendChars } from './match.ts';
import type { CandidateGroup } from './match.ts';

/** 這些呼叫都該成功；失敗本身就是要紅的。 */
const groupsOf = (...args: Parameters<typeof recommendChars>): CandidateGroup[] => {
  const r = recommendChars(...args);
  expect(r.ok, r.ok ? '' : r.reason).toBe(true);
  if (!r.ok) throw new Error(r.reason);
  return r.groups;
};

describe('逐字五行資料', () => {
  it('五行疊字自驗（來源正確性的最起碼檢查）', () => {
    expect(charElementOf('淼')).toBe('水');
    expect(charElementOf('森')).toBe('木');
    expect(charElementOf('焱')).toBe('火');
    expect(charElementOf('垚')).toBe('土');
    expect(charElementOf('鑫')).toBe('金');
  });

  it('這份資料不依部首——把它當部首表用會全盤錯', () => {
    // docs/v2-sources.md 第 7 節實測：明的部首是日（火），資料卻給水。
    expect(charElementOf('明')).toBe('水');
    expect(charElementOf('口')).toBe('木');
    expect(charElementOf('手')).toBe('金');
  });

  it('未收錄的字回 undefined，不猜', () => {
    expect(charElementOf('𡈙')).toBeUndefined(); // 罕字
    expect(charElementOf('A')).toBeUndefined();
    expect(charElementOf('')).toBeUndefined();
  });

  it('常用字表為 Big5 Level 1，覆蓋率與查證紀錄一致', () => {
    expect(COMMON_CHARS).toHaveLength(5402);
    expect(isCommonChar('明')).toBe(true);
    expect(isCommonChar('𡈙')).toBe(false);
    // 覆蓋率自己重算，不採信資料檔宣告的數字（那是拿資料檔驗自己）。
    const covered = COMMON_CHARS.filter((ch) => charElementOf(ch) !== undefined).length;
    // 93.7%，比查證紀錄的 93.8% 少 3 個字 —— 那 3 個是上游有兩說、本站不選邊者。
    expect(`${((covered / COMMON_CHARS.length) * 100).toFixed(1)}%`).toBe('93.7%');
    expect(CHAR_WUXING_STATS.commonCoverage).toBe('93.7%');
  });

  it('跨來源衝突照實記錄，不擅自調和（v1 慣例）', () => {
    expect(CHAR_WUXING_CONFLICTS).toHaveLength(11);
    const yi = CHAR_WUXING_CONFLICTS.find((c) => c.char === '乙')!;
    expect(yi['ben-hua']).toBe('木');
    expect(yi.zhenyangze).toBe('土');
    // 本站採 ben-hua，資料檔的值要與宣告的一致。
    for (const c of CHAR_WUXING_CONFLICTS) {
      const actual = charElementOf(c.char);
      // 不用 if 跳過 —— 該有的字若不見了，這裡就該紅。
      expect(actual, `${c.char} 應在索引中`).toBeDefined();
      expect(actual, `${c.char} 與宣告的採用來源不符`).toBe(c['ben-hua']);
    }
  });
});

describe('逐字評述（SPEC-v2 #18）', () => {
  const favor = ['木', '水'] as const;
  const avoid = ['火', '土'] as const;

  it('補到用神／傷用神／中性三類都判得出來', () => {
    // 森＝木（喜用）、焱＝火（忌神）、鑫＝金（兩者皆非）
    const r = matchName(['森', '焱', '鑫'], [...favor], [...avoid]);
    expect(r.chars.map((c) => c.verdict)).toEqual(['補用神', '傷用神', '中性']);
    expect(r.chars[0]!.explanation).toContain('補到用神');
    expect(r.chars[1]!.explanation).toContain('忌神');
    expect(r.summary).toContain('森');
    expect(r.summary).toContain('焱');
  });

  it('五行不明的字照實回報，不列入評述（SPEC-v2 #24）', () => {
    const r = matchName(['森', '𡈙'], [...favor], [...avoid]);
    expect(r.chars[1]!.verdict).toBe('五行不明');
    expect(r.chars[1]!.element).toBeUndefined();
    expect(r.chars[1]!.explanation).toContain('未收錄');
    expect(r.unknown).toEqual(['𡈙']);
    expect(r.summary).toContain('未列入評述');
    // 摘要不得因為「沒有壞字」就宣稱全名皆喜用（有未知字時那句話是錯的）。
    expect(r.summary).not.toContain('全名');
  });

  it('摘要只陳述數得出來的事實，不宣稱「全名如何」', () => {
    // 森＝木（喜用）、鑫＝金（中性）：不能說「全名都落在喜用」。
    const r = matchName(['森', '鑫'], [...favor], [...avoid]);
    expect(r.summary).toContain('森 補到用神');
    expect(r.summary).toContain('鑫 為中性');
    expect(r.summary).not.toContain('全名');
  });

  it('所有兩說未定的字都不在索引裡，且橋接不會把它們接回來', () => {
    expect(CHAR_WUXING_UNDECIDED.size).toBe(3);
    expect([...CHAR_WUXING_UNDECIDED.keys()].sort()).toEqual(['夥', '藉', '釘'].sort());
    // readings 依產生器排序後存放，這裡逐字比對集合內容。
    expect(new Set(CHAR_WUXING_UNDECIDED.get('釘'))).toEqual(new Set(['火', '金']));
    expect(new Set(CHAR_WUXING_UNDECIDED.get('藉'))).toEqual(new Set(['金', '木']));
    expect(new Set(CHAR_WUXING_UNDECIDED.get('夥'))).toEqual(new Set(['木', '火']));
    for (const [char, readings] of CHAR_WUXING_UNDECIDED) {
      expect(charElementOf(char), `${char} 不該有五行`).toBeUndefined();
      expect(readings.length).toBeGreaterThan(1);
    }
  });

  it('上游對同一個字有兩說時不選邊，回五行不明並列出兩說', () => {
    // 釘：上游一處作火、一處作金（一簡對多繁合併），本站不替它裁決。
    expect(charElementOf('釘')).toBeUndefined();
    const r = matchName(['釘'], [...favor], [...avoid]);
    expect(r.chars[0]!.verdict).toBe('五行不明');
    expect(r.chars[0]!.explanation).toContain('兩種五行');
    expect(r.chars[0]!.explanation).toContain('不替它選邊');
  });

  it('人工補充字：玹（上游未收，人工查證屬金）', () => {
    // 上游《通用規範漢字表》與 zhenyangze 對帳源都沒收「玹」；
    // 依 tools/gen-char-wuxing.mjs 的 MANUAL_SUPPLEMENTS 補入（來源：起名网字典）。
    expect(charElementOf('玹')).toBe('金');
    expect(kangxiStrokeCount('玹')).toBe(10); // 與來源頁「康熙筆畫 10」一致
  });

  it('喜用為空時明講無從評述，不假裝有結論', () => {
    const r = matchName(['森'], [], ['木', '火', '土', '金', '水']);
    expect(r.summary).toContain('無從評述');
    expect(r.candidates).toEqual([]);
  });
});

describe('候選字推薦（SPEC-v2 #19）', () => {
  it('只從常用字表挑，且五行正確', () => {
    const groups = groupsOf(['水'], [], { limit: 50 });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.element).toBe('水');
    expect(groups[0]!.chars.length).toBeGreaterThan(0);
    for (const c of groups[0]!.chars) {
      expect(isCommonChar(c.char), `${c.char} 不在常用字表`).toBe(true);
      expect(charElementOf(c.char)).toBe('水');
      expect(c.strokes).toBe(kangxiStrokeCount(c.char));
    }
  });

  it('排除名字已用的字，並依筆畫排序', () => {
    const groups = groupsOf(['木'], ['森'], { limit: 100 });
    expect(groups[0]!.chars.some((c) => c.char === '森')).toBe(false);
    const strokes = groups[0]!.chars.map((c) => c.strokes ?? 0);
    expect([...strokes].sort((a, b) => a - b)).toEqual(strokes);

    // 同筆畫者依碼點排序（不是 localeCompare —— 那會隨環境的定序資料而變）。
    for (let i = 1; i < groups[0]!.chars.length; i++) {
      const prev = groups[0]!.chars[i - 1]!;
      const cur = groups[0]!.chars[i]!;
      if (prev.strokes === cur.strokes) {
        expect(prev.char.codePointAt(0)!).toBeLessThan(cur.char.codePointAt(0)!);
      }
    }
  });

  it('無效的筆畫範圍明確回報，不靜默回空清單（SPEC-v2 #24）', () => {
    const reversed = recommendChars(['木'], [], { strokes: { min: 20, max: 5 } });
    expect(reversed.ok).toBe(false);
    if (!reversed.ok) expect(reversed.reason).toContain('筆畫範圍無效');

    for (const bad of [0, -3, 1.5, Number.NaN]) {
      expect(recommendChars(['木'], [], { strokes: { min: bad } }).ok, String(bad)).toBe(false);
    }
    expect(recommendChars(['木'], [], { limit: 0 }).ok).toBe(false);

    // 經 matchName 時同樣要把原因帶出來，而不是顯示成「零個候選字」。
    const m = matchName(['森'], ['木'], ['火'], { strokes: { min: 20, max: 5 } });
    expect(m.candidates).toEqual([]);
    expect(m.candidateError).toContain('筆畫範圍無效');
  });

  it('筆畫範圍過濾', () => {
    const groups = groupsOf(['火'], [], { limit: 100, strokes: { min: 8, max: 10 } });
    for (const c of groups[0]!.chars) {
      expect(c.strokes).toBeGreaterThanOrEqual(8);
      expect(c.strokes).toBeLessThanOrEqual(10);
    }
  });

  it('limit 只截斷顯示，total 是「套用條件後」的數量而非字表總數', () => {
    const [group] = groupsOf(['金'], [], { limit: 5 });
    expect(group!.chars).toHaveLength(5);
    expect(group!.total).toBeGreaterThan(5);

    // 加上筆畫範圍後 total 必須跟著變小 —— 它不是常用字表中該五行的總字數。
    const [narrowed] = groupsOf(['金'], [], { limit: 5, strokes: { min: 10, max: 12 } });
    expect(narrowed!.total).toBeLessThan(group!.total);
    // 排除名字用字後也會少 1。
    const first = group!.chars[0]!.char;
    const [excluded] = groupsOf(['金'], [first], { limit: 5 });
    expect(excluded!.total).toBe(group!.total - 1);
  });

  it('純函式：同輸入同輸出，且不改動傳入的陣列', () => {
    const favor: Element[] = ['土'];
    const used = ['王'];
    const first = groupsOf(favor, used, { limit: 10 });
    expect(groupsOf(favor, used, { limit: 10 })).toEqual(first);
    expect(favor).toEqual(['土']);
    expect(used).toEqual(['王']);
    // 固定預期值：跨環境都該得到同一批字（碼點排序的意義就在這）。
    expect(first[0]!.chars.slice(0, 3).map((c) => c.char)).toEqual(['一', '又', '丫']);
  });
});
