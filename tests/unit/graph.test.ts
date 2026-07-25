import { describe, it, expect } from "vitest";
import {
  toConceptMap,
  buildEdges,
  detectPrerequisiteCycles,
  prerequisiteAncestors,
  topoSort,
  computeLearningRoute,
  findDanglingRefs,
  type ConceptData,
} from "../../src/lib/graph";

const c = (
  id: string,
  prerequisites: string[] = [],
  extra: Partial<ConceptData> = {},
): ConceptData => ({
  id,
  subject: "mathematics",
  category: "test",
  name: { ja: id },
  prerequisites,
  recommendedNext: [],
  related: [],
  alternatives: [],
  ...extra,
});

describe("toConceptMap", () => {
  it("重複IDを検出する", () => {
    expect(() => toConceptMap([c("a"), c("a")])).toThrow(/重複/);
  });
});

describe("detectPrerequisiteCycles", () => {
  it("循環がなければ空配列", () => {
    const map = toConceptMap([c("a"), c("b", ["a"]), c("d", ["b"])]);
    expect(detectPrerequisiteCycles(map)).toEqual([]);
  });
  it("循環を検出する", () => {
    const map = toConceptMap([c("a", ["d"]), c("b", ["a"]), c("d", ["b"])]);
    expect(detectPrerequisiteCycles(map).length).toBeGreaterThan(0);
  });
});

describe("prerequisiteAncestors", () => {
  it("推移的な前提をすべて返す", () => {
    const map = toConceptMap([c("a"), c("b", ["a"]), c("d", ["b"])]);
    expect([...prerequisiteAncestors("d", map)].sort()).toEqual(["a", "b"]);
  });
});

describe("topoSort", () => {
  it("prerequisite順を守る", () => {
    const map = toConceptMap([c("a"), c("b", ["a"]), c("d", ["b", "a"])]);
    const order = topoSort(["d", "b", "a"], map);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("d"));
  });
  it("循環があれば例外", () => {
    const map = toConceptMap([c("a", ["b"]), c("b", ["a"])]);
    expect(() => topoSort(["a", "b"], map)).toThrow();
  });
});

describe("computeLearningRoute", () => {
  // vector-space → jordan-normal-form を模した鎖
  const map = toConceptMap([
    c("mappings"),
    c("vector-space", ["mappings"]),
    c("linear-map", ["vector-space"]),
    c("basis", ["vector-space"]),
    c("eigen", ["linear-map", "basis"]),
    c("jordan", ["eigen"]),
  ]);

  it("開始なし: 全前提をトポロジカル順で返す", () => {
    const route = computeLearningRoute([], "jordan", map);
    expect(route.steps).toContain("mappings");
    expect(route.steps.at(-1)).toBe("jordan");
    expect(route.steps.indexOf("vector-space")).toBeLessThan(
      route.steps.indexOf("eigen"),
    );
  });

  it("開始地点の理解済み概念を除外する", () => {
    const route = computeLearningRoute(["vector-space"], "jordan", map);
    expect(route.steps).not.toContain("mappings");
    expect(route.skipped).toContain("vector-space");
    expect(route.steps).toContain("linear-map");
    expect(route.steps.at(-1)).toBe("jordan");
  });

  it("存在しない目的概念は例外", () => {
    expect(() => computeLearningRoute([], "nope", map)).toThrow();
  });
});

describe("findDanglingRefs", () => {
  it("存在しない参照を報告する", () => {
    const map = toConceptMap([c("a", ["ghost"])]);
    expect(findDanglingRefs(map).length).toBe(1);
  });
});

describe("buildEdges", () => {
  it("related/alternativeは片方向のみ保持する", () => {
    const map = toConceptMap([
      c("a", [], { related: ["b"] }),
      c("b", [], { related: ["a"] }),
    ]);
    const edges = buildEdges(map).filter((e) => e.kind === "related");
    expect(edges.length).toBe(1);
  });
});
