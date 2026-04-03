import { describe, expect, it, vi } from "vitest";
import { executeRequest } from "../src/execute.js";

describe("runtime executeRequest", () => {
  it("uses config.fetch and returns the shared success envelope", async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      expect(request.url).toBe("https://api.example.com/orders/123?expand=lineItems");
      expect(request.headers.get("authorization")).toBe("Bearer token");
      expect(request.headers.get("cookie")).toBe("session=abc");
      return new Response(JSON.stringify({ id: 123 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const onRequest = vi.fn();
    const onResponse = vi.fn();

    const result = await executeRequest<{ id: number }>(
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
  });

  it("returns typed http-style failures with response metadata", async () => {
    const result = await executeRequest<{ id: number }>(
      {
        baseUrl: "https://api.example.com",
        fetch: async () =>
          new Response(JSON.stringify({ message: "Missing" }), {
            status: 404,
            headers: { "content-type": "application/json; charset=utf-8" },
          }),
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

  it("returns a timeout failure with 408 status", async () => {
    const result = await executeRequest(
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
    const result = await executeRequest(
      {
        baseUrl: "https://api.example.com",
        fetch: async () => {
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
