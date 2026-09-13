// SPEC-v4 #27：兩張分享圖卡的中性色與網頁同一個灰。對照表是純資料，import 時不碰 Canvas。
// 網頁那一側的 token 值由 e2e/visual-tokens.spec.ts 以 getComputedStyle 驗同一組色值
// （vitest 會把 CSS import 清成空字串，這裡讀不到 style.css）。
import { describe, expect, it } from 'vitest';
import { CARD_TONE } from './draw.ts';

/** style.css `:root` 淺色值。 */
const NEUTRAL = '#6b645a';
const NEUTRAL_SOFT = '#eeebe6';
const MID = '#8a6d1f';
const MID_SOFT = '#f6efdc';

describe('圖卡 tone 對照表', () => {
  it('neutral 用中性灰，與 CSS --neutral／--neutral-soft 同值', () => {
    expect(CARD_TONE.neutral.fill).toBe(NEUTRAL_SOFT);
    expect(CARD_TONE.neutral.text).toBe(NEUTRAL);
  });

  it('neutral 不再借用黃色（mid），黃色只留給半吉與喜忌並見', () => {
    expect(CARD_TONE.neutral.fill).not.toBe(MID_SOFT);
    expect(CARD_TONE.neutral.text).not.toBe(MID);
  });

  it('mid（半吉、喜忌並見）維持黃色', () => {
    expect(CARD_TONE.mid).toEqual({ fill: MID_SOFT, text: MID });
  });

  it('good／bad／unknown 不變', () => {
    expect(CARD_TONE.good).toEqual({ fill: '#e6f0e8', text: '#2f6b3f' });
    expect(CARD_TONE.bad).toEqual({ fill: '#f7e4e4', text: '#9c2b2b' });
    expect(CARD_TONE.unknown).toEqual({ stroke: '#e2ddd4', text: '#5c554d' });
  });
});
