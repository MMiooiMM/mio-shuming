// 卡片輸出（SPEC-v4 #5、#7）：支援 Web Share（含檔案）就叫出系統分享選單，否則下載 PNG。
// B7 比較卡片重用此模組。
//
// 依據（Web Share API, W3C https://w3c.github.io/web-share/ 與 MDN Navigator.share／canShare）：
// - `share()` 需要 transient activation，缺少時 reject `NotAllowedError`；呼叫端必須在按鈕點擊中呼叫。
// - `canShare({ files })` 在「實作不支援檔案分享」時回 false，不需要 user activation。
// - 使用者取消（或沒有可分享的目標）reject `AbortError`——這是使用者的選擇，靜默即可。
//
// **不寫入網址**（SPEC-v4 #7）：下載用暫時的 blob URL 掛在 <a download> 上點擊，
// 不動 location、history。

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded';

type ShareNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // 立刻 revoke 在部分瀏覽器會讓下載落空，給它一點時間。
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function shareOrDownload(file: File, title: string): Promise<ShareOutcome> {
  const nav = navigator as ShareNavigator;
  const data: ShareData = { files: [file], title };

  if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // NotAllowedError（例如繪製太久、點擊的 activation 已過期）等：退回下載，使用者仍拿得到圖。
    }
  }

  downloadFile(file);
  return 'downloaded';
}
