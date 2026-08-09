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

/** 複数の記事状態から、もっとも進んでいる状態を返す。 */
export function highestHistoryState(
  states: Array<HistoryState | null | undefined>,
): HistoryState | null {
  let highest: HistoryState | null = null;
  for (const state of states) {
    if (state && historyRank(state) > historyRank(highest)) highest = state;
  }
  return highest;
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

/** 一覧をまるごと保存する（読み込み機能でも使う） */
export function saveHistory(list: HistoryEntry[]): void {
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

/** 到達段階を直接設定する。null は未記録に戻す。 */
export function setHistoryState(
  entry: Omit<HistoryEntry, "state" | "updatedAt">,
  state: HistoryState | null,
): HistoryState | null {
  const list = loadHistory();
  const index = list.findIndex((e) => e.articleId === entry.articleId);

  if (state === null) {
    if (index >= 0) list.splice(index, 1);
    saveHistory(list);
    notifyHistoryChange();
    return null;
  }

  const next: HistoryEntry = {
    ...entry,
    state,
    updatedAt: Date.now(),
  };
  if (index >= 0) list[index] = next;
  else list.push(next);
  saveHistory(list);
  notifyHistoryChange();
  return state;
}

/**
 * 段階のスイッチを切り替える。段階どうしは独立して押せるが、
 * 上の段階は下の段階を含むので連動する。
 *
 *   入っていない段階を入れる → その段階までまとめて入る
 *     （「理解した」を入れると「読んだ」も入る）
 *   入っている段階を切る     → その段階から上をまとめて切る
 *     （「読んだ」を切ると「理解した」も切れる）
 *
 * 保存するのは到達した段階ひとつだけで、下が入っているかは順番から導く。
 * 戻り値は切り替え後の到達段階（すべて切れたら null）。
 */
export function toggleHistory(
  entry: Omit<HistoryEntry, "state" | "updatedAt">,
  stage: HistoryState,
): HistoryState | null {
  const current = historyStateOf(entry.articleId);

  // いま入っているなら、その1つ下まで戻す（＝この段階から上を切る）
  const targetRank = hasReached(current, stage)
    ? historyRank(stage) - 1
    : historyRank(stage);
  const nextState = targetRank < 0 ? null : HISTORY_STAGES[targetRank].id;

  return setHistoryState(entry, nextState);
}

export function removeHistory(articleId: string): HistoryEntry[] {
  const list = loadHistory().filter((e) => e.articleId !== articleId);
  saveHistory(list);
  notifyHistoryChange();
  return list;
}

export function clearHistory(): void {
  saveHistory([]);
  notifyHistoryChange();
}

/** 同じ画面内の地図・一覧にも、記録変更を即時反映する。 */
function notifyHistoryChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("atlasez-history-change"));
  }
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
