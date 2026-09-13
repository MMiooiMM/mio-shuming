// SPEC-v4 #11：收藏加存預產期，向後相容舊 v1 資料。
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadFavorites, saveFavorites, type Favorite } from './naming-ui.ts';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('loadFavorites / saveFavorites（向後相容）', () => {
  it('舊格式（沒有 due）讀得到，due 為 undefined', () => {
    const storage = fakeStorage({
      'mio-shuming:favorites:v1': JSON.stringify([{ surname: '王', givenName: '小明' }]),
    });
    const favs = loadFavorites(storage);
    expect(favs).toEqual([{ surname: '王', givenName: '小明' }]);
    expect(favs[0]!.due).toBeUndefined();
  });

  it('新格式（含 due）往返一致', () => {
    const storage = fakeStorage();
    const favs: Favorite[] = [{ surname: '王', givenName: '小明', due: { year: 2024, month: 3, day: 15 } }];
    expect(saveFavorites(favs, storage)).toBe(true);
    expect(loadFavorites(storage)).toEqual(favs);
  });

  it('due 形狀壞掉時該筆仍在，只是 due 消失', () => {
    const storage = fakeStorage({
      'mio-shuming:favorites:v1': JSON.stringify([
        { surname: '王', givenName: '小明', due: { year: '2024', month: 3 } }, // 壞：year 非數字、缺 day
        { surname: '陳', givenName: '大文', due: null },
        { surname: '林', givenName: '小美', due: { year: 2024, month: 3, day: 15 } },
      ]),
    });
    const favs = loadFavorites(storage);
    expect(favs).toHaveLength(3);
    expect(favs[0]).toEqual({ surname: '王', givenName: '小明' });
    expect(favs[1]).toEqual({ surname: '陳', givenName: '大文' });
    expect(favs[2]).toEqual({ surname: '林', givenName: '小美', due: { year: 2024, month: 3, day: 15 } });
  });

  it('壞掉的整包 JSON 不炸，回傳空陣列', () => {
    const storage = fakeStorage({ 'mio-shuming:favorites:v1': '{not json' });
    expect(loadFavorites(storage)).toEqual([]);
  });

  it('不是陣列的內容回傳空陣列', () => {
    const storage = fakeStorage({ 'mio-shuming:favorites:v1': JSON.stringify({ oops: true }) });
    expect(loadFavorites(storage)).toEqual([]);
  });
});
