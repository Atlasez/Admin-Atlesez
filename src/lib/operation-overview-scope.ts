export const OPERATION_SCOPE_MISSING_MESSAGE =
  "進行管理の情報を読み込めませんでした。再読み込みしてください。";

export type OperationOverviewScope = {
  isManager: boolean;
  projectRole?: string;
  email: string;
};

/**
 * 進行管理APIの scope が欠けている応答では isManager を読まず、
 * 画面側が英語の例外文を出さないようにする。
 */
export const readOperationScope = (
  data: { scope?: unknown } | null | undefined,
): OperationOverviewScope | null => {
  const scope = data?.scope;
  if (!scope || typeof scope !== "object") return null;
  const record = scope as {
    isManager?: unknown;
    projectRole?: unknown;
    email?: unknown;
  };
  return {
    isManager: record.isManager === true,
    projectRole:
      typeof record.projectRole === "string" ? record.projectRole : undefined,
    email: typeof record.email === "string" ? record.email : "",
  };
};
