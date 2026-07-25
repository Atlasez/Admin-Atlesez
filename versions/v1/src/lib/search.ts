/**
 * 検索の抽象化レイヤー。
 * 現在はPagefind（完全静的）を利用。記事数が大きく増えた場合は
 * この関数群の実装を外部検索サービス（Meilisearch, Algolia等）に
 * 差し替えるだけで、UI側の変更なしに移行できる。
 */

export interface SearchResultItem {
  title: string;
  url: string;
  excerptHtml: string;
  meta: Record<string, string>;
}

export interface SearchFilters {
  [name: string]: string | undefined;
}

export interface SearchAdapter {
  search(query: string, filters: SearchFilters): Promise<SearchResultItem[]>;
  /** フィルタ名 → 選択肢と件数 */
  filters(): Promise<Record<string, Record<string, number>>>;
}

interface PagefindModule {
  search(
    query: string,
    options?: { filters?: Record<string, string> },
  ): Promise<{
    results: {
      data: () => Promise<{
        url: string;
        excerpt: string;
        meta: Record<string, string>;
      }>;
    }[];
  }>;
  filters(): Promise<Record<string, Record<string, number>>>;
  options(opts: Record<string, unknown>): Promise<void>;
  init(): void;
}

/** Pagefind実装（ビルド後の /pagefind/pagefind.js を動的import） */
export async function createPagefindAdapter(
  basePath: string,
): Promise<SearchAdapter> {
  const url = `${basePath.replace(/\/$/, "")}/pagefind/pagefind.js`;
  const pagefind = (await import(/* @vite-ignore */ url)) as PagefindModule;
  await pagefind.options({ excerptLength: 30 });
  pagefind.init();
  return {
    async search(query, filters) {
      const activeFilters: Record<string, string> = {};
      for (const [k, v] of Object.entries(filters)) {
        if (v) activeFilters[k] = v;
      }
      const res = await pagefind.search(query, {
        filters:
          Object.keys(activeFilters).length > 0 ? activeFilters : undefined,
      });
      const items = await Promise.all(
        res.results.slice(0, 30).map(async (r) => {
          const d = await r.data();
          return {
            title: d.meta["title"] ?? d.url,
            url: d.url,
            excerptHtml: d.excerpt,
            meta: d.meta,
          };
        }),
      );
      return items;
    },
    filters() {
      return pagefind.filters();
    },
  };
}
