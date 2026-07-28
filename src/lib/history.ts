/**
 * 学習履歴のクライアント側ユーティリティ。
 *
 * 「あとで読む」（bookmarks.ts）が“これから読むもの”を溜めるのに対し、
 * こちらは“どこまで進んだか”を記録する。データはこの端末のブラウザ内
 * （localStorage）にのみ保存され、サーバーには送信されない。
 *
 * 段階は下の HISTORY_STAGES の並び順で表す。**後ろの段階は前の段階を含む**
 * （「理解した」なら「読んだ」も達成済み）。保存するのは到達した段階ひとつだけで、
 * それより手前が達成済みかどうかは順番から導く。
 *
 * 段階を増やすときは HISTORY_STAGES に足すだけでよい。
 * 例:「とりあえず目を通した → しっかり読んだ → 他人に説明できる」
 * 画面・集計・保存のいずれも配列を見て動くので、他を触る必要はない。
 */

/** 進み具合の段階。手前から順に並べる。id は保存値なので後から変えない。 */
export const HISTORY_STAGES = [
  { id: "read", labelKey: "markRead", icon: "✓" },
  { id: "understood", labelKey: "markUnderstood", icon: "◎" },
] as const;

export type HistoryState = (typeof HISTORY_STAGES)[number]["id"];

/** 段階の並び順。未記録は -1。 */
export function historyRank(state: HistoryState | null): number {
  if (!state) return -1;
  return HISTORY_STAGES.findIndex((s) => s.id === state);
}

/** その段階に到達しているか（後ろの段階を選べば手前も達成済み） */
export function hasReached(
  current: HistoryState | null,
  stage: HistoryState,
): boolean {
  return historyRank(current) >= historyRank(stage);
}

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

/**
 * 段階ごとの件数（一覧ページの見出しに使う）。
 * 「その段階ちょうど」の件数を数える。段階を増やしても自動で追随する。
 */
export function countHistory(entries: HistoryEntry[] = loadHistory()): {
  byStage: Record<string, number>;
  read: number;
  understood: number;
  total: number;
} {
  const byStage: Record<string, number> = {};
  for (const stage of HISTORY_STAGES) byStage[stage.id] = 0;
  for (const e of entries) {
    if (byStage[e.state] !== undefined) byStage[e.state] += 1;
  }
  return {
    byStage,
    read: byStage.read ?? 0,
    understood: byStage.understood ?? 0,
    total: entries.length,
  };
}
