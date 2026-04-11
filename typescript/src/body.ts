import { gunzipSync, unzlibSync } from "fflate";

const textDecoder = new TextDecoder();

function toArrayBuffer(buffer: Uint8Array<ArrayBufferLike>): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function toPlainString(value: string | number | boolean | bigint): string {
  return String(value);
}

function toTextBody(value: unknown): string {
  if (
    typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
    || typeof value === "bigint"
  ) {
    return toPlainString(value);
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

function toUrlEncodedValue(value: string | Blob | File): string {
  if (typeof value === "string") {
    return value;
  }

  return value instanceof File ? value.name : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Flatten a nested object into bracket-notation entries for form encoding.
 * Example: { a: { b: 1 }, c: [2, 3] } → [["a[b]", "1"], ["c[0]", "2"], ["c[1]", "3"]]
 */
function flattenFormData(
  data: Record<string, unknown>,
): [string, string | Blob | File][] {
  const entries: [string, string | Blob | File][] = [];
  const seen = new WeakSet<object>();

  function recurse(value: unknown, prefix: string): void {
    if (value === undefined || value === null) return;
    if (value instanceof Blob || value instanceof File) {
      entries.push([prefix, value]);
      return;
    }
    if (typeof value === "object") {
      if (seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          recurse(value[i], `${prefix}[${i}]`);
        }
      } else {
        for (const [key, val] of Object.entries(value)) {
          recurse(val, prefix ? `${prefix}[${key}]` : key);
        }
      }
      return;
    }
    entries.push([prefix, toTextBody(value)]);
  }

  recurse(data, "");
  return entries;
}

/**
 * Serialize a request body based on content type.
 */
export function serializeBody(
  body: unknown,
  contentType?: string,
): { body: BodyInit | undefined; contentType: string | undefined } {
  if (body === undefined || body === null) {
    return { body: undefined, contentType: undefined };
  }

  const ct = contentType ?? "application/json";

  if (ct === "application/json" || ct.endsWith("+json")) {
    return {
      body: JSON.stringify(body),
      contentType: ct,
    };
  }

  if (ct === "text/plain" || ct === "text/csv" || ct.startsWith("text/")) {
    return {
      body: toTextBody(body),
      contentType: ct,
    };
  }

  if (ct === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams();
    if (isRecord(body)) {
      for (const [key, value] of flattenFormData(body)) {
        params.set(key, toUrlEncodedValue(value));
      }
    }
    return {
      body: params.toString(),
      contentType: ct,
    };
  }

  if (ct === "multipart/form-data") {
    const formData = new FormData();
    if (isRecord(body)) {
      for (const [key, value] of flattenFormData(body)) {
        formData.append(key, value);
      }
    }
    // Don't set content-type — fetch sets it with the boundary automatically
    return {
      body: formData,
      contentType: undefined,
    };
  }

  if (ct === "application/octet-stream") {
    return {
      body: body as BodyInit,
      contentType: ct,
    };
  }

  // Fallback: treat as string
  return {
    body: toTextBody(body),
    contentType: ct,
  };
}

function getContentEncodings(response: Response): string[] {
  const raw = response.headers.get("content-encoding") ?? "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0 && value !== "identity");
}

async function decompressBuffer(
  buffer: Uint8Array<ArrayBufferLike>,
  encoding: "gzip" | "deflate",
): Promise<Uint8Array<ArrayBufferLike>> {
  if (typeof DecompressionStream !== "undefined") {
    try {
      const stream = new Blob([toArrayBuffer(buffer)]).stream().pipeThrough(new DecompressionStream(encoding));
      const decompressed = await new Response(stream).arrayBuffer();
      return new Uint8Array(decompressed);
    } catch {
      return buffer;
    }
  }

  try {
    return encoding === "gzip" ? gunzipSync(buffer) : unzlibSync(buffer);
  } catch {
    return buffer;
  }
}

async function readResponseBuffer(response: Response): Promise<Uint8Array<ArrayBufferLike>> {
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(await response.arrayBuffer());

  for (const encoding of getContentEncodings(response).reverse()) {
    if (encoding === "gzip" || encoding === "x-gzip") {
      buffer = await decompressBuffer(buffer, "gzip");
      continue;
    }

    if (encoding === "deflate") {
      buffer = await decompressBuffer(buffer, "deflate");
    }
  }

  return buffer;
}

function parseJsonBuffer(buffer: Uint8Array<ArrayBufferLike>): unknown {
  return JSON.parse(textDecoder.decode(buffer));
}

/**
 * Parse a response body based on Content-Type header.
 * Error responses (4xx/5xx) always attempt JSON first.
 */
export async function parseResponseBody(
  response: Response,
  isError: boolean,
): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const buffer = await readResponseBuffer(response);

  // No body
  if (response.status === 204 || response.status === 304) {
    return undefined;
  }

  // Error responses — always try JSON first regardless of content-type
  if (isError) {
    try {
      return parseJsonBuffer(buffer);
    } catch {
      // Fall through to content-type based parsing
    }
  }

  // JSON
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    return parseJsonBuffer(buffer);
  }

  // Text formats
  if (contentType.includes("text/")) {
    return textDecoder.decode(buffer);
  }

  // Binary
  if (
    contentType.includes("application/octet-stream") ||
    contentType.includes("application/pdf") ||
    contentType.includes("image/")
  ) {
    return toArrayBuffer(buffer);
  }

  // XML
  if (contentType.includes("application/xml") || contentType.includes("+xml")) {
    return textDecoder.decode(buffer);
  }

  // Fallback: try JSON, then text
  const text = textDecoder.decode(buffer);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
