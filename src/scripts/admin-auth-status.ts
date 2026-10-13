export type AdminAuthStatus = {
  canAccessAdmin?: boolean;
  email?: string;
  isManager?: boolean;
  managerProjects?: string[];
  error?: string;
};

export type AdminAuthStatusResult = {
  ok: boolean;
  status: number;
  contentType: string;
  data: AdminAuthStatus;
};

type AuthStatusState = {
  request: Promise<AdminAuthStatusResult> | null;
  cache: { value: AdminAuthStatusResult; expiresAt: number } | null;
};

const authStatusState = (): AuthStatusState => {
  const host = globalThis as typeof globalThis & {
    __atlasezAdminAuthStatus?: AuthStatusState;
  };
  // ナビのscriptと操作検索のscriptが別バンドルになっても、同じ起動要求を共有する。
  host.__atlasezAdminAuthStatus ??= { request: null, cache: null };
  return host.__atlasezAdminAuthStatus;
};

/** 起動時のナビと操作検索が同じ応答を使う。失敗はキャッシュせず、画面側の再試行が次の応答を受け取れるようにする。 */
export const fetchAdminAuthStatus = (): Promise<AdminAuthStatusResult> => {
  const state = authStatusState();
  if (state.cache && state.cache.expiresAt > Date.now()) {
    return Promise.resolve(state.cache.value);
  }
  if (!state.request) {
    const request = fetch("/api/admin/auth-status", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const contentType = response.headers.get("content-type") ?? "";
        const data = contentType.includes("application/json")
          ? ((await response.json()) as AdminAuthStatus)
          : {};
        return {
          ok: response.ok,
          status: response.status,
          contentType,
          data,
        };
      })
      .catch(() => ({ ok: false, status: 0, contentType: "", data: {} }));
    state.request = request
      .then((result) => {
        // Both the manager visibility and account widgets need the same
        // response during startup. Keep it briefly without changing the
        // existing no-store request or longer-term permission freshness.
        if (result.ok || result.status === 401) {
          state.cache = { value: result, expiresAt: Date.now() + 1_000 };
        }
        return result;
      })
      .finally(() => {
        state.request = null;
      });
  }
  return state.request;
};
