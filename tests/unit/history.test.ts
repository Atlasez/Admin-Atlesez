import { describe, it, expect, beforeEach } from "vitest";
import {
  HISTORY_STAGES,
  historyRank,
  hasReached,
  toggleHistory,
  setHistoryState,
  historyStateOf,
  countHistory,
  loadHistory,
  clearHistory,
} from "../../src/lib/history";

/** localStorage が無い環境（Node）向けの最小実装 */
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
});

const entry = {
  articleId: "ja-math-sets",
  locale: "ja",
  title: "集合",
  href: "/atlas/ja/mathematics/set-theory/sets/",
  subject: "数学",
  category: "集合論",
  summary: "",
};

describe("学習の記録: 段階", () => {
  it("段階は手前から順に並んでいる", () => {
    expect(HISTORY_STAGES.map((s) => s.id)).toEqual(["read", "understood"]);
  });

  it("未記録の順位は -1", () => {
    expect(historyRank(null)).toBe(-1);
  });

  it("後ろの段階は手前の段階を含む", () => {
    // 「理解した」を選んだら「読んだ」も達成済みとして扱う
    expect(hasReached("understood", "read")).toBe(true);
    expect(hasReached("understood", "understood")).toBe(true);
    // 逆は成り立たない
    expect(hasReached("read", "understood")).toBe(false);
    expect(hasReached(null, "read")).toBe(false);
  });

  it("3段階の到達状態を直接設定できる", () => {
    expect(setHistoryState(entry, "read")).toBe("read");
    expect(setHistoryState(entry, "understood")).toBe("understood");
    expect(hasReached(historyStateOf(entry.articleId), "read")).toBe(true);
    expect(setHistoryState(entry, null)).toBeNull();
    expect(historyStateOf(entry.articleId)).toBeNull();
  });

  it("上の段階を入れると下の段階も入る", () => {
    // いきなり「理解した」を入れても「読んだ」は達成済みになる
    expect(toggleHistory(entry, "understood")).toBe("understood");
    expect(hasReached(historyStateOf(entry.articleId), "read")).toBe(true);
    // 1記事につき1件しか持たない
    expect(loadHistory()).toHaveLength(1);
  });

  it("上の段階を切っても下の段階は残る", () => {
    toggleHistory(entry, "understood");
    expect(toggleHistory(entry, "understood")).toBe("read");
    expect(historyStateOf(entry.articleId)).toBe("read");
  });

  it("下の段階を切ると上の段階も切れる", () => {
    toggleHistory(entry, "understood");
    expect(toggleHistory(entry, "read")).toBeNull();
    expect(historyStateOf(entry.articleId)).toBeNull();
    expect(loadHistory()).toHaveLength(0);
  });

  it("一番下の段階を入れて切ると未記録に戻る", () => {
    expect(toggleHistory(entry, "read")).toBe("read");
    expect(toggleHistory(entry, "read")).toBeNull();
    expect(historyStateOf(entry.articleId)).toBeNull();
  });

  it("件数は段階ごとに数える", () => {
    toggleHistory(entry, "read");
    toggleHistory({ ...entry, articleId: "ja-math-maps" }, "understood");

    const counts = countHistory();
    expect(counts.byStage.read).toBe(1);
    expect(counts.byStage.understood).toBe(1);
    expect(counts.total).toBe(2);
    // 段階を増やしても byStage に自動で並ぶ
    expect(Object.keys(counts.byStage)).toEqual(
      HISTORY_STAGES.map((s) => s.id),
    );
  });

  it("すべて消せる", () => {
    toggleHistory(entry, "read");
    clearHistory();
    expect(loadHistory()).toHaveLength(0);
  });
});
