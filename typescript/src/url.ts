/**
 * Build a full URL from base URL, path template, path params, and query params.
 */
export function buildUrl(
  baseUrl: string,
  path: string,
  pathParams?: Record<string, unknown>,
  queryParams?: Record<string, unknown>,
  queryStyles?: Record<string, { style: string; explode: boolean }>,
): string {
  // Substitute path params
  let resolvedPath = path;
  if (pathParams) {
    for (const [key, value] of Object.entries(pathParams)) {
      resolvedPath = resolvedPath.replace(
        `{${key}}`,
        encodeURIComponent(String(value)),
      );
    }
  }

  // Build base
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const fullPath = resolvedPath.startsWith("/") ? resolvedPath : `/${resolvedPath}`;
  let url = `${base}${fullPath}`;

  // Build query string
  if (queryParams) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(queryParams)) {
      if (value === undefined || value === null) continue;
      const style = queryStyles?.[key];
      parts.push(...serializeQueryParam(key, value, style));
    }
    if (parts.length > 0) {
      url += `?${parts.join("&")}`;
    }
  }

  return url;
}

function serializeQueryParam(
  key: string,
  value: unknown,
  style?: { style: string; explode: boolean },
): string[] {
  // Default: form + explode=true (OpenAPI default for query params)
  const s = style?.style ?? "form";
  const explode = style?.explode ?? true;

  if (Array.isArray(value)) {
    return serializeArrayParam(key, value, s, explode);
  }

  if (typeof value === "object" && value !== null) {
    return serializeObjectParam(key, value as Record<string, unknown>, s, explode);
  }

  return [`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`];
}

function serializeArrayParam(
  key: string,
  values: unknown[],
  style: string,
  explode: boolean,
): string[] {
  const encodedKey = encodeURIComponent(key);

  switch (style) {
    case "form":
      if (explode) {
        // ?tags=a&tags=b&tags=c
        return values.map((v) => `${encodedKey}=${encodeURIComponent(String(v))}`);
      }
      // ?tags=a,b,c
      return [`${encodedKey}=${values.map((v) => encodeURIComponent(String(v))).join(",")}`];

    case "spaceDelimited":
      return [`${encodedKey}=${values.map((v) => encodeURIComponent(String(v))).join("%20")}`];

    case "pipeDelimited":
      return [`${encodedKey}=${values.map((v) => encodeURIComponent(String(v))).join("|")}`];

    default:
      // Default to form + explode
      return values.map((v) => `${encodedKey}=${encodeURIComponent(String(v))}`);
  }
}

function serializeObjectParam(
  key: string,
  obj: Record<string, unknown>,
  style: string,
  explode: boolean,
): string[] {
  if (style === "deepObject") {
    // ?options[color]=red&options[size]=large
    return Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) =>
        `${encodeURIComponent(key)}[${encodeURIComponent(k)}]=${encodeURIComponent(String(v))}`,
      );
  }

  if (explode) {
    // ?color=red&size=large
    return Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      );
  }

  // ?options=color,red,size,large
  const parts = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .flatMap(([k, v]) => [encodeURIComponent(k), encodeURIComponent(String(v))]);
  return [`${encodeURIComponent(key)}=${parts.join(",")}`];
}
