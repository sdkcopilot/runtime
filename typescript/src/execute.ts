import type { ContentCategory, RequestConfig, RequestParams, RuntimeResult } from "./types.js";
import { buildUrl } from "./url.js";
import { resolveAuth } from "./auth.js";
import { serializeBody, parseResponseBody } from "./body.js";

function toStringRecord(obj: unknown): Record<string, string> {
  if (!obj || typeof obj !== "object") return {};
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]));
}

function serializeCookies(cookies: Record<string, unknown> | undefined): string | undefined {
  if (!cookies) return undefined;
  const entries = Object.entries(cookies);
  if (entries.length === 0) return undefined;
  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("; ");
}

function categorizeContentType(raw: string): "json" | "text" | "csv" | "xml" | "binary" | "form" | "other" {
  const ct = raw.toLowerCase().split(";")[0]!.trim();
  if (ct === "application/json" || ct.endsWith("+json")) return "json";
  if (ct === "text/csv") return "csv";
  if (ct === "application/xml" || ct === "text/xml" || ct.endsWith("+xml")) return "xml";
  if (ct === "text/plain") return "text";
  if (ct === "multipart/form-data" || ct === "application/x-www-form-urlencoded") return "form";
  if (
    ct === "application/octet-stream" ||
    ct === "application/pdf" ||
    ct.startsWith("image/") ||
    ct.startsWith("audio/") ||
    ct.startsWith("video/")
  ) return "binary";
  return "other";
}

/**
 * Execute an HTTP request using native fetch.
 * Works in both browser and Node.js 18+.
 */
export async function executeRequest<T>(
  config: RequestConfig,
  params: RequestParams,
): Promise<RuntimeResult<T>> {
  // Resolve base URL (operation override > config)
  const baseUrl = params.baseUrl ?? config.baseUrl;

  // Resolve auth (per-request override > config-level)
  const auth = params.auth !== undefined ? params.auth : config.auth;
  const { headers: authHeaders, queryParams: authQueryParams } = resolveAuth(auth);

  // Merge query params with auth query params
  const mergedQuery = { ...params.queryParams, ...authQueryParams };

  // Build URL
  const url = buildUrl(
    baseUrl,
    params.path,
    params.pathParams,
    mergedQuery,
    params.queryStyles,
  );

  // Serialize body
  const { body, contentType } = serializeBody(params.body, params.contentType);

  // Build headers
  const headers: Record<string, string> = {
    ...config.headers,
    ...authHeaders,
    ...toStringRecord(params.headers),
  };
  const cookieHeader = serializeCookies(params.cookies);
  if (cookieHeader) {
    headers["Cookie"] = headers["Cookie"] ? `${headers["Cookie"]}; ${cookieHeader}` : cookieHeader;
  }
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  // Setup abort controller for timeout
  const controller = new AbortController();
  const timeout = config.timeout ?? 30_000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Build request
    const request = new Request(url, {
      method: params.method.toUpperCase(),
      headers,
      body,
      signal: controller.signal,
    });

    // Call onRequest hook
    config.onRequest?.(request);

    // Execute
    const fetchFn = config.fetch ?? fetch;
    const response = await fetchFn(request);

    // Call onResponse hook
    config.onResponse?.(response);

    // Parse response
    const isError = response.status >= 400;
    const responseData = await parseResponseBody(response, isError);
    const rawContentType = response.headers.get("content-type") ?? "application/octet-stream";
    const contentType = categorizeContentType(rawContentType);

    if (isError) {
      return {
        ok: false,
        status: response.status,
        contentType,
        rawContentType,
        error: { type: "http", status: response.status, matchedStatus: String(response.status), data: responseData },
        response,
      };
    }

    return {
      ok: true,
      status: response.status,
      contentType,
      rawContentType,
      data: responseData as T,
      warnings: [],
      response,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Create a minimal Response for timeout errors
      const response = new Response(null, { status: 408, statusText: "Timeout" });
      return {
        ok: false,
        status: 408,
        contentType: "other" as ContentCategory,
        rawContentType: "",
        error: { type: "timeout", timeoutMs: timeout },
        response,
      };
    }

    const response = new Response(null, { status: 502, statusText: "Network Error" });
    return {
      ok: false,
      status: 502,
      contentType: "other" as ContentCategory,
      rawContentType: "",
      error: { type: "network", cause: err },
      response,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
