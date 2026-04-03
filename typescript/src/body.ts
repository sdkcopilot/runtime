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
      if (seen.has(value as object)) return;
      seen.add(value as object);
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          recurse(value[i], `${prefix}[${i}]`);
        }
      } else {
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
          recurse(val, prefix ? `${prefix}[${key}]` : key);
        }
      }
      return;
    }
    entries.push([prefix, String(value)]);
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
      body: String(body),
      contentType: ct,
    };
  }

  if (ct === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams();
    if (typeof body === "object" && body !== null) {
      for (const [key, value] of flattenFormData(body as Record<string, unknown>)) {
        params.set(key, String(value));
      }
    }
    return {
      body: params.toString(),
      contentType: ct,
    };
  }

  if (ct === "multipart/form-data") {
    const formData = new FormData();
    if (typeof body === "object" && body !== null) {
      for (const [key, value] of flattenFormData(body as Record<string, unknown>)) {
        formData.append(key, value as string | Blob);
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
    body: String(body),
    contentType: ct,
  };
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

  // No body
  if (response.status === 204 || response.status === 304) {
    return undefined;
  }

  // Error responses — always try JSON first regardless of content-type
  if (isError) {
    try {
      return await response.json();
    } catch {
      // Fall through to content-type based parsing
    }
  }

  // JSON
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    return response.json();
  }

  // Text formats
  if (contentType.includes("text/")) {
    return response.text();
  }

  // Binary
  if (
    contentType.includes("application/octet-stream") ||
    contentType.includes("application/pdf") ||
    contentType.includes("image/")
  ) {
    return response.arrayBuffer();
  }

  // XML
  if (contentType.includes("application/xml") || contentType.includes("+xml")) {
    return response.text();
  }

  // Fallback: try JSON, then text
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
