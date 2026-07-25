/**
 * ブックマーク（あとで読む）機能のクライアント側ユーティリティ。
 * データはこの端末のブラウザ内（localStorage）にのみ保存され、サーバーには送信されない。
 */

export interface Bookmark {
  articleId: string;
  locale: string;
  title: string;
  href: string;
  subject: string;
  category: string;
  summary: string;
  savedAt: number;
}

const KEY = "atlasez-bookmarks";

export function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Bookmark[];
  } catch {
    return [];
  }
}

function save(list: Bookmark[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* プライベートモード等で保存できない場合は黙って無視 */
  }
}

export function isBookmarked(articleId: string): boolean {
  return loadBookmarks().some((b) => b.articleId === articleId);
}

export function removeBookmark(articleId: string): Bookmark[] {
  const list = loadBookmarks().filter((b) => b.articleId !== articleId);
  save(list);
  return list;
}

/** 追加/削除を切り替え、切り替え後に保存されているかを返す */
export function toggleBookmark(entry: Omit<Bookmark, "savedAt">): boolean {
  const list = loadBookmarks();
  const idx = list.findIndex((b) => b.articleId === entry.articleId);
  if (idx >= 0) {
    list.splice(idx, 1);
    save(list);
    return false;
  }
  list.push({ ...entry, savedAt: Date.now() });
  save(list);
  return true;
}

export function clearBookmarks(): void {
  save([]);
}
