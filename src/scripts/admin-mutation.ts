import { readAdminApiJson } from "../lib/admin-api";
export async function adminMutation<T>(
  url: string,
  method: string,
  payload: unknown,
  fallback: string,
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readAdminApiJson<T & { error?: string }>(
    response,
    fallback,
  );
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}
export async function withAdminButtonLock(
  button: HTMLButtonElement,
  operation: () => Promise<void>,
) {
  if (button.dataset.mutating === "true") return;
  button.dataset.mutating = "true";
  const disabled = button.disabled;
  button.disabled = true;
  try {
    await operation();
  } finally {
    button.dataset.mutating = "false";
    button.disabled = disabled;
  }
}
