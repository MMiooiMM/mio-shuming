// Generates src/data/locations.json — 台灣 22 縣市的代表經度，供真太陽時的
// 經度差校正使用（SPEC-v2 #7）。
//
// 資料來源
//   政府資料開放平臺 dataset 25489「3碼郵遞區號與行政區中心點經緯度對照表」
//   提供機關：中華郵政股份有限公司
//   授權：政府資料開放授權條款－第 1 版
//   https://data.gov.tw/dataset/25489
//   原始檔（本檔以 tools/raw/post-districts.xml 留存）：
//   https://www.post.gov.tw/post/download/1050812_行政區經緯度(toPost).xml
//
// 為什麼要自己推導「縣市經度」
//   官方沒有「縣市代表經度」這種東西——縣市是面，不是點。上游資料只有
//   368 個鄉鎮市區的中心點。本檔的代表經度是**推導值不是權威值**，所以
//   一併輸出該縣市各行政區中心點經度的最小／最大值，讓 UI 能誠實呈現
//   「同一個縣市內部就有多少誤差」，並保留手填經度的路徑（SPEC-v2 #3）。
//
// 取中位數而非平均或中點
//   中位數不受離群經度影響；平均與 (min+max)/2 都會被少數面積懸殊、位置偏遠的
//   行政區拉走。這只是統計上的穩健性，**不宣稱**中位數更接近人口重心——上游
//   資料只有行政區中心點，沒有人口權重。
//
// 取得上游原始檔（tools/raw/ 不入版控）：
//   curl -L -o tools/raw/post-districts.xml \
//     "https://www.post.gov.tw/post/download/1050812_%E8%A1%8C%E6%94%BF%E5%8D%80%E7%B6%93%E7%B7%AF%E5%BA%A6(toPost).xml"
//
// Run: node tools/gen-locations.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'tools', 'raw', 'post-districts.xml');
const OUT = join(ROOT, 'src', 'data', 'locations.json');

/** 22 縣市，用上游資料的用字（臺，不是台）。 */
const COUNTIES = [
  '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市',
  '基隆市', '新竹市', '嘉義市',
  '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣',
  '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
];

/**
 * 排除的行政區——三處無常住人口的離島，經度離本島 2–5 度。
 * 留著會讓所屬縣市的經度範圍看起來荒謬（高雄市 115.8°–120.9°）。
 * 出生於此者請用手填經度。
 */
const EXCLUDED = ['宜蘭縣釣魚臺列嶼', '高雄市東沙群島', '高雄市南沙群島'];

const xml = readFileSync(SRC, 'utf8');
const re =
  /<行政區名>(.*?)<\/行政區名>\s*<_x0033_碼郵遞區號>(.*?)<\/_x0033_碼郵遞區號>\s*<中心點經度>(.*?)<\/中心點經度>/g;

const districts = [];
for (let m; (m = re.exec(xml)); ) {
  districts.push({ name: m[1], zip: m[2], lon: Number(m[3]) });
}
if (districts.length === 0) throw new Error('上游 XML 解析不到任何行政區，格式可能已變更。');

const median = (sorted) => {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round4 = (n) => Math.round(n * 1e4) / 1e4;

const counties = COUNTIES.map((county) => {
  const lons = districts
    .filter((d) => d.name.startsWith(county) && !EXCLUDED.includes(d.name))
    .map((d) => d.lon)
    .sort((a, b) => a - b);
  if (lons.length === 0) throw new Error(`${county} 在上游資料中查無行政區。`);
  return {
    name: county,
    longitude: round4(median(lons)),
    min: round4(lons[0]),
    max: round4(lons[lons.length - 1]),
    districts: lons.length,
  };
});

const excludedFound = districts.filter((d) => EXCLUDED.includes(d.name)).map((d) => d.name);
if (excludedFound.length !== EXCLUDED.length) {
  throw new Error(`排除清單與上游資料不符，實際找到：${excludedFound.join('、') || '（無）'}`);
}

const out = {
  $comment:
    '台灣 22 縣市代表經度。longitude 是該縣市各行政區中心點經度的中位數（推導值，非官方定義）；' +
    'min/max 為同縣市的經度範圍，用來呈現誤差。由 tools/gen-locations.mjs 產生，不要手改。',
  source: {
    dataset: '政府資料開放平臺 dataset 25489「3碼郵遞區號與行政區中心點經緯度對照表」',
    provider: '中華郵政股份有限公司',
    license: '政府資料開放授權條款－第 1 版',
    url: 'https://data.gov.tw/dataset/25489',
    file: 'https://www.post.gov.tw/post/download/1050812_行政區經緯度(toPost).xml',
    derivation:
      '縣市代表經度＝該縣市各鄉鎮市區中心點經度的中位數；官方未定義縣市代表點，此為本站推導。',
    excluded: `已排除無常住人口的離島 ${EXCLUDED.join('、')}（經度離本島 2–5 度，會使所屬縣市範圍失真）`,
    districtCount: districts.length,
  },
  /** 台灣採用的標準時區中央經線（UTC+8 → 東經 120°）。 */
  standardMeridian: 120,
  timezoneOffsetMinutes: 480,
  counties,
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(
  `wrote ${OUT}: ${counties.length} 縣市 / ${districts.length} 行政區（排除 ${EXCLUDED.length}）`,
);
