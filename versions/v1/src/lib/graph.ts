/**
 * 概念グラフ: 学習地図・学習ルート・関連記事自動生成の中核ロジック。
 * Astroにも他フレームワークにも依存しない純粋なTypeScript。
 */

export type EdgeKind =
  "prerequisite" | "recommended-next" | "related" | "part-of" | "alternative";

export interface ConceptData {
  id: string;
  subject: string;
  category: string;
  name: { ja: string; en?: string };
  prerequisites: string[];
  recommendedNext: string[];
  related: string[];
  partOf?: string;
  alternatives: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
}

export type ConceptMap = Map<string, ConceptData>;

export function toConceptMap(concepts: ConceptData[]): ConceptMap {
  const map: ConceptMap = new Map();
  for (const c of concepts) {
    if (map.has(c.id)) {
      throw new Error(`概念IDが重複しています: ${c.id}`);
    }
    map.set(c.id, c);
  }
  return map;
}

/** 全エッジを重複なく列挙する（source→targetの向きは「targetのためにsourceが必要/関連」） */
export function buildEdges(map: ConceptMap): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const push = (source: string, target: string, kind: EdgeKind) => {
    const key = `${kind}:${source}->${target}`;
    const reverseKey = `${kind}:${target}->${source}`;
    // related / alternative は無向として扱い、片方向のみ保持
    if (
      (kind === "related" || kind === "alternative") &&
      seen.has(reverseKey)
    ) {
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, kind });
  };
  for (const c of map.values()) {
    for (const p of c.prerequisites) push(p, c.id, "prerequisite");
    for (const n of c.recommendedNext) push(c.id, n, "recommended-next");
    for (const r of c.related) push(c.id, r, "related");
    for (const a of c.alternatives) push(c.id, a, "alternative");
    if (c.partOf) push(c.partOf, c.id, "part-of");
  }
  return edges;
}

/** 存在しない概念への参照を検出する */
export function findDanglingRefs(map: ConceptMap): string[] {
  const errors: string[] = [];
  for (const c of map.values()) {
    const refs = [
      ...c.prerequisites,
      ...c.recommendedNext,
      ...c.related,
      ...c.alternatives,
      ...(c.partOf ? [c.partOf] : []),
    ];
    for (const r of refs) {
      if (!map.has(r)) {
        errors.push(`${c.id} が存在しない概念 ${r} を参照しています`);
      }
    }
  }
  return errors;
}

/** prerequisiteエッジの循環を検出する。循環があれば各サイクルの経路を返す */
export function detectPrerequisiteCycles(map: ConceptMap): string[][] {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const cycles: string[][] = [];
  const stack: string[] = [];

  const visit = (id: string): void => {
    color.set(id, GRAY);
    stack.push(id);
    const node = map.get(id);
    if (node) {
      for (const p of node.prerequisites) {
        if (!map.has(p)) continue;
        const c = color.get(p) ?? WHITE;
        if (c === GRAY) {
          const start = stack.indexOf(p);
          cycles.push([...stack.slice(start), p]);
        } else if (c === WHITE) {
          visit(p);
        }
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };

  for (const id of map.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) visit(id);
  }
  return cycles;
}

/** 目的概念の前提となる概念（祖先）をすべて集める（目的自身は含まない） */
export function prerequisiteAncestors(
  goalId: string,
  map: ConceptMap,
): Set<string> {
  const result = new Set<string>();
  const walk = (id: string) => {
    const node = map.get(id);
    if (!node) return;
    for (const p of node.prerequisites) {
      if (!result.has(p)) {
        result.add(p);
        walk(p);
      }
    }
  };
  walk(goalId);
  return result;
}

/** prerequisite制約を満たすトポロジカル順序（Kahn法・入力順を安定に保つ） */
export function topoSort(ids: string[], map: ConceptMap): string[] {
  const idSet = new Set(ids);
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of ids) {
    const node = map.get(id);
    const prereqsInSet = (node?.prerequisites ?? []).filter((p) =>
      idSet.has(p),
    );
    indeg.set(id, prereqsInSet.length);
    for (const p of prereqsInSet) {
      const arr = dependents.get(p) ?? [];
      arr.push(id);
      dependents.set(p, arr);
    }
  }
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    order.push(id);
    for (const d of dependents.get(id) ?? []) {
      const n = (indeg.get(d) ?? 1) - 1;
      indeg.set(d, n);
      if (n === 0) queue.push(d);
    }
  }
  if (order.length !== ids.length) {
    throw new Error("prerequisiteグラフに循環があるため順序を決定できません");
  }
  return order;
}

export interface LearningRoute {
  /** 学ぶべき概念（トポロジカル順、目的概念を含む） */
  steps: string[];
  /** 開始概念の理解によりスキップされた前提概念 */
  skipped: string[];
  /** 各ステップの代替解説（alternativeエッジ） */
  alternativesByStep: Record<string, string[]>;
}

/**
 * 学習ルートを計算する。
 * - prerequisiteエッジのみを利用
 * - 目的概念の祖先（前提概念の閉包）を抽出
 * - 開始概念とその祖先は理解済みとみなして除外
 * - トポロジカル順序で並べる
 */
export function computeLearningRoute(
  startIds: string[],
  goalId: string,
  map: ConceptMap,
): LearningRoute {
  if (!map.has(goalId)) {
    throw new Error(`目的概念が見つかりません: ${goalId}`);
  }
  const needed = prerequisiteAncestors(goalId, map);
  needed.add(goalId);

  const known = new Set<string>();
  for (const s of startIds) {
    if (!map.has(s)) continue;
    known.add(s);
    for (const a of prerequisiteAncestors(s, map)) known.add(a);
  }
  known.delete(goalId);

  const toLearn = [...needed].filter((id) => !known.has(id));
  const skipped = [...needed].filter((id) => known.has(id));
  const steps = topoSort(toLearn, map);

  const alternativesByStep: Record<string, string[]> = {};
  for (const id of steps) {
    const node = map.get(id);
    if (node && node.alternatives.length > 0) {
      alternativesByStep[id] = node.alternatives;
    }
  }
  return { steps, skipped, alternativesByStep };
}
