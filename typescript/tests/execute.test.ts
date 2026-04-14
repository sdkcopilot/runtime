import { describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { executeRequest } from "../src/execute.js";
import type { OperationRequest, RuntimeResult } from "../src/types.js";

describe("runtime executeRequest", () => {
  it("uses config.fetch and returns the shared success envelope", async () => {
    const fetchMock = vi.fn((url: URL, init: RequestInit) => {
      expect(url.toString()).toBe("https://api.example.com/orders/123?expand=lineItems");
      // The auth header is "Authorization" (capital A), not "authorization"
      // Handle the fact that headers in RequestInit might be different format
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe("Bearer token");
      expect(headers.get("cookie")).toBe("session=abc");
      return Promise.resolve(new Response(JSON.stringify({ id: 123 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    });

    const onRequest = vi.fn();
    const onResponse = vi.fn();

    const result = await executeRequest<OperationRequest, RuntimeResult<{ id: number }>>(
      {
        baseUrl: "https://api.example.com",
        auth: { bearer: "token" },
        fetch: fetchMock,
        onRequest,
        onResponse,
      },
      {
        method: "get",
        path: "/orders/{id}",
        params: {
          path: { id: 123 },
          query: { expand: "lineItems" },
          cookies: { session: "abc" },
        },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      status: 200,
      contentType: "json",
      rawContentType: "application/json",
      data: { id: 123 },
      warnings: [],
    });

    if (result.ok) {
      expect(result.data.id).toBe(123);
    }
  });

  it("returns typed http-style failures with response metadata", async () => {
    const result = await executeRequest<OperationRequest, RuntimeResult<{ id: number }, { "404": { message: string } }>>(
      {
        baseUrl: "https://api.example.com",
        fetch: () =>
          Promise.resolve(new Response(JSON.stringify({ message: "Missing" }), {
            status: 404,
            headers: { "content-type": "application/json; charset=utf-8" },
          })),
      },
      {
        method: "get",
        path: "/orders/404",
        params: {},
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.contentType).toBe("json");
      expect(result.rawContentType).toBe("application/json; charset=utf-8");
      expect(result.error).toEqual({
        type: "http",
        status: 404,
        matchedStatus: "404",
        data: { message: "Missing" },
      });
    }
  });

  it("decodes gzip-compressed JSON responses before parsing", async () => {
    const compressed = gzipSync(JSON.stringify({ id: 456 }));

    const result = await executeRequest<OperationRequest, RuntimeResult<{ id: number }>>(
      {
        baseUrl: "https://api.example.com",
        fetch: () =>
          Promise.resolve(new Response(compressed, {
            status: 200,
            headers: {
              "content-type": "application/json",
              "content-encoding": "gzip",
            },
          })),
      },
      {
        method: "get",
        path: "/orders/456",
        params: {},
      },
    );

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      contentType: "json",
      rawContentType: "application/json",
      data: { id: 456 },
      warnings: [],
    });
  });

  it("falls back safely when fetch already returns a decoded body with gzip header preserved", async () => {
    const result = await executeRequest<OperationRequest, RuntimeResult<{ id: number }>>(
      {
        baseUrl: "https://api.example.com",
        fetch: () =>
          Promise.resolve(new Response(JSON.stringify({ id: 789 }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "content-encoding": "gzip",
            },
          })),
      },
      {
        method: "get",
        path: "/orders/789",
        params: {},
      },
    );

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      contentType: "json",
      rawContentType: "application/json",
      data: { id: 789 },
      warnings: [],
    });
  });

  it("uses the fflate fallback when DecompressionStream is unavailable", async () => {
    const compressed = gzipSync(JSON.stringify({ id: 987 }));
    const originalDecompressionStream = globalThis.DecompressionStream;

    // Simulate an older runtime without native streaming decompression support.
    Object.defineProperty(globalThis, "DecompressionStream", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      const result = await executeRequest<OperationRequest, RuntimeResult<{ id: number }>>(
        {
          baseUrl: "https://api.example.com",
          fetch: () =>
            Promise.resolve(new Response(compressed, {
              status: 200,
              headers: {
                "content-type": "application/json",
                "content-encoding": "gzip",
              },
            })),
        },
        {
          method: "get",
          path: "/orders/987",
          params: {},
        },
      );

      expect(result).toMatchObject({
        ok: true,
        status: 200,
        contentType: "json",
        rawContentType: "application/json",
        data: { id: 987 },
        warnings: [],
      });
    } finally {
      Object.defineProperty(globalThis, "DecompressionStream", {
        value: originalDecompressionStream,
        configurable: true,
        writable: true,
      });
    }
  });

  it("returns a timeout failure with 408 status", async () => {
    const result = await executeRequest<OperationRequest, RuntimeResult<never>>(
      {
        baseUrl: "https://api.example.com",
        timeout: 1,
        fetch: async () =>
          new Promise<Response>((_, reject) => {
            setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 5);
          }),
      },
      {
        method: "get",
        path: "/slow",
        params: {},
      },
    );

    expect(result).toMatchObject({
      ok: false,
      status: 408,
      contentType: "other",
      rawContentType: "",
      error: { type: "timeout", timeoutMs: 1 },
    });
  });

  it("returns a network failure with 502 status", async () => {
    const result = await executeRequest<OperationRequest, RuntimeResult<never>>(
      {
        baseUrl: "https://api.example.com",
        fetch: () => {
          throw new Error("socket hang up");
        },
      },
      {
        method: "get",
        path: "/broken",
        params: {},
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.contentType).toBe("other");
      expect(result.error.type).toBe("network");
    }
  });
});
