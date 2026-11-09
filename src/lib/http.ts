import "server-only";
import { NextResponse } from "next/server";
import { config } from "./config";
import { RateLimitError } from "./rate-limit";

export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function jsonReply(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}
export function requireSameOrigin(request: Request) {
  if (request.headers.get("origin") !== config().origin)
    throw new HttpError(
      "Open this form on the app’s own website and try again.",
      403,
    );
}
export async function readBytes(
  request: Request,
  maxBytes = 300000,
): Promise<Buffer> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(
          "This request is too large. Reduce the table size and try again.",
          413,
        );
      }
      chunks.push(part.value);
    }
  return Buffer.concat(chunks);
}
export async function readJson(
  request: Request,
  maxBytes = 300000,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError("Send this request using the app.", 415);
  const bytes = await readBytes(request, maxBytes);
  try {
    const data = JSON.parse(bytes.toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    throw new HttpError(
      "This request could not be read. Check your entries and try again.",
    );
  }
}
export function apiError(error: unknown, operation: string) {
  if (error instanceof HttpError)
    return jsonReply({ message: error.message }, error.status);
  if (error instanceof RateLimitError)
    return jsonReply({ message: error.message }, 429);
  console.error("request_failed", {
    operation,
    requestId: crypto.randomUUID(),
  });
  return jsonReply(
    {
      message:
        "The service is temporarily unavailable. Your table is still here. Please try again shortly.",
    },
    503,
  );
}
export function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
