/**
 * 学習履歴（読んだ・理解した）のクライアント側ユーティリティ。
 *
 * 「あとで読む」（bookmarks.ts）が“これから読むもの”を溜めるのに対し、
 * こちらは“もう読んだ・理解したもの”を記録する。データはこの端末のブラウザ内
 * （localStorage）にのみ保存され、サーバーには送信されない。
 *
 * 状態は read（読んだ）→ understood（理解した）の2段階。
 * 「理解した」は「読んだ」を含むものとして扱い、1記事につき1エントリだけ持つ。
 */

export type HistoryState = "read" | "understood";

export interface HistoryEntry {
  articleId: string;
  locale: string;
  title: string;
  href: string;
  subject: string;
  category: string;
  summary: string;
  state: HistoryState;
  /** 最後に状態を更新した時刻 */
  updatedAt: number;
}

const KEY = "atlasez-history";

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as HistoryEntry[]).filter(
      (e) => e && typeof e.articleId === "string",
    );
  } catch {
    return [];
  }
}

function save(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* プライベートモード等で保存できない場合は黙って無視 */
  }
}

/** その記事の現在の状態（未記録なら null） */
export function historyStateOf(articleId: string): HistoryState | null {
  return loadHistory().find((e) => e.articleId === articleId)?.state ?? null;
}

/**
 * 状態を切り替える。同じ状態をもう一度押すと取り消す。
 * 戻り値は切り替え後の状態（取り消した場合は null）。
 */
export function toggleHistory(
  entry: Omit<HistoryEntry, "state" | "updatedAt">,
  state: HistoryState,
): HistoryState | null {
  const list = loadHistory();
  const index = list.findIndex((e) => e.articleId === entry.articleId);

  if (index >= 0 && list[index].state === state) {
    list.splice(index, 1);
    save(list);
    return null;
  }

  const next: HistoryEntry = { ...entry, state, updatedAt: Date.now() };
  if (index >= 0) list[index] = next;
  else list.push(next);
  save(list);
  return state;
}

export function removeHistory(articleId: string): HistoryEntry[] {
  const list = loadHistory().filter((e) => e.articleId !== articleId);
  save(list);
  return list;
}

export function clearHistory(): void {
  save([]);
}

/** 状態ごとの件数（一覧ページの見出しに使う） */
export function countHistory(entries: HistoryEntry[] = loadHistory()): {
  read: number;
  understood: number;
  total: number;
} {
  let read = 0;
  let understood = 0;
  for (const e of entries) {
    if (e.state === "understood") understood += 1;
    else read += 1;
  }
  return { read, understood, total: read + understood };
}
