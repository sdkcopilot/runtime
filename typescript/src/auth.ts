import type { AuthConfig } from "./types.js";

/**
 * Resolve auth into headers and/or query params.
 * Returns the headers to add and any query params to merge.
 */
export function resolveAuth(
  auth: AuthConfig | undefined,
): { headers: Record<string, string>; queryParams: Record<string, string> } {
  const headers: Record<string, string> = {};
  const queryParams: Record<string, string> = {};

  if (auth == null) return { headers, queryParams };

  if (auth.bearer) {
    headers["Authorization"] = `Bearer ${auth.bearer}`;
  }

  if (auth.basic) {
    const encoded = btoa(`${auth.basic.user}:${auth.basic.pass}`);
    headers["Authorization"] = `Basic ${encoded}`;
  }

  if (auth.oauth2?.accessToken) {
    headers["Authorization"] = `Bearer ${auth.oauth2.accessToken}`;
  }

  if (auth.apiKey) {
    switch (auth.apiKey.in) {
      case "header":
        headers[auth.apiKey.name] = auth.apiKey.value;
        break;
      case "query":
        queryParams[auth.apiKey.name] = auth.apiKey.value;
        break;
      case "cookie":
        headers["Cookie"] = `${auth.apiKey.name}=${auth.apiKey.value}`;
        break;
    }
  }

  return { headers, queryParams };
}
