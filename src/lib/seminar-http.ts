export const seminarJson = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
export const seminarError = (error: string, status = 400) =>
  seminarJson({ error }, status);
export const missingSeminar = () => seminarError("対象が見つかりません。", 404);

export const seminarText = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function seminarBody(request: Request, limit = 100_000) {
  if (Number(request.headers.get("content-length")) > limit) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const buffer = new Uint8Array(limit);
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return buffer.slice(0, offset);
      if (offset + value.byteLength > limit) {
        await reader.cancel();
        return null;
      }
      buffer.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function seminarPayload(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return null;
  try {
    const data = await seminarBody(request);
    if (!data) return null;
    const payload: unknown = JSON.parse(new TextDecoder().decode(data));
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
