import type {
  BuilderTypes,
  ContentCategory,
  RequestConfig,
  RequestParams,
  ValidationMode,
  ValidationWarning,
  ValidatorFn,
} from "./types.js";
import { buildUrl } from "./url.js";
import { resolveAuth } from "./auth.js";
import { serializeBody, parseResponseBody } from "./body.js";
import { resolveValidationConfig, toValidationWarnings, validateInputSection } from "./validation.js";

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

function validateRequestBody(
  validator: ValidatorFn | Record<string, ValidatorFn> | undefined,
  body: unknown,
  contentType: string | undefined,
  bodyRequired: boolean,
  mode: ValidationMode,
): ValidationWarning[] {
  if (!validator || mode === "off") return [];
  if (body === undefined && !bodyRequired) return [];

  if (typeof validator === "function") {
    return validateInputSection("input", validator, body);
  }

  const key = contentType ?? "application/json";
  const bodyValidator = validator[key]
    ?? validator["application/json"]
    ?? validator[Object.keys(validator)[0] ?? ""];
  return validateInputSection("input", bodyValidator, body);
}

/**
 * Execute an HTTP request using native fetch.
 * Works in both browser and Node.js 18+.
 */
export async function executeRequest<TResult, T extends BuilderTypes = BuilderTypes>(
  config: RequestConfig,
  {
    method,
    path,
    baseUrl = config.baseUrl,
    queryStyles,
    validators,
    inputValidators,
    bodyRequired = false,
    params: {
      path: pathParams,
      query,
      headers: paramHeaders,
      cookies: paramCookies,
      body: paramBody,
      contentType: paramContentType,
      auth: paramAuth,
      validation: paramValidation,
    },
  }: RequestParams<T>,
): Promise<TResult> {
  const validation = resolveValidationConfig(config.validation, paramValidation);
  const inputWarnings = validation.input === "off"
    ? []
    : [
        ...validateInputSection("input", inputValidators?.path, pathParams ?? {}),
        ...validateInputSection("input", inputValidators?.query, query ?? {}),
        ...validateInputSection("input", inputValidators?.headers, paramHeaders ?? {}),
        ...validateInputSection("input", inputValidators?.cookies, paramCookies ?? {}),
        ...validateRequestBody(
          inputValidators?.body,
          paramBody,
          paramContentType,
          bodyRequired,
          validation.input,
        ),
      ];

  if (inputWarnings.length > 0) {
    config.onValidationWarning?.(inputWarnings);
    if (validation.input === "strict") {
      const response = new Response(null, { status: 422, statusText: "Input Validation Failed" });
      return {
        ok: false,
        status: 422,
        contentType: "other" as ContentCategory,
        rawContentType: "",
        response,
        error: {
          type: "validation",
          phase: "input",
          data: {
            path: pathParams,
            query,
            headers: paramHeaders,
            cookies: paramCookies,
            body: paramBody,
            contentType: paramContentType,
          },
          errors: inputWarnings,
        },
      } as TResult;
    }
  }

  const auth = paramAuth !== undefined ? paramAuth : config.auth;
  const { headers: authHeaders, queryParams: authQueryParams } = resolveAuth(auth);
  const mergedQuery = Object.assign({}, query as Record<string, unknown> | undefined, authQueryParams);

  const url = buildUrl(
    baseUrl,
    path,
    pathParams as Record<string, unknown> | undefined,
    mergedQuery,
    queryStyles,
  );

  const { body, contentType } = serializeBody(paramBody, paramContentType);

  const headers: Record<string, string> = {
    ...config.headers,
    ...authHeaders,
    ...toStringRecord(paramHeaders),
  };
  const cookieHeader = serializeCookies(paramCookies as Record<string, unknown> | undefined);
  if (cookieHeader) {
    headers["Cookie"] = headers["Cookie"] ? `${headers["Cookie"]}; ${cookieHeader}` : cookieHeader;
  }
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  // Only enforce a timeout when one is explicitly configured.
  const hasTimeout = Number.isFinite(config.timeout) && (config.timeout ?? 0) > 0;
  const controller = hasTimeout ? new AbortController() : null;
  const timeout = hasTimeout ? (config.timeout as number) : undefined;
  const timeoutId = hasTimeout && controller
    ? setTimeout(() => controller.abort(), timeout)
    : null;

  try {
    // Build request
    const request = new Request(url, {
      method: method.toUpperCase(),
      headers,
      body,
      signal: controller?.signal,
    });

    // Call onRequest hook
    config.onRequest?.(request);

    // Execute
    const fetchFn = config.fetch ?? fetch;
    const response = await fetchFn(request);

    // Call onResponse hook
    config.onResponse?.(response);

    // Parse response
    const isOk = response.status < 400;
    const responseData = await parseResponseBody(response, !isOk);
    const rawContentType = response.headers.get("content-type") ?? "application/octet-stream";
    const contentType = categorizeContentType(rawContentType);
    const base = { status: response.status, contentType, rawContentType, response };

    const warnings: ValidationWarning[] = [...inputWarnings];
    const statusCode = String(response.status);
    const statusClass = `${statusCode[0]}XX`;
    const matchedStatus = validators?.[statusCode]
      ? statusCode
      : validators?.[statusClass]
        ? statusClass
        : validators?.default
          ? "default"
          : statusCode;
    const validate = validators?.[matchedStatus];
    if (validate && validation.output !== "off" && contentType === "json") {
      const valid = validate(responseData, { instancePath: "data" });
      if (!valid && validate.errors) {
        const outputWarnings = toValidationWarnings("output", validate.errors);
        warnings.push(...outputWarnings);
        config.onValidationWarning?.(outputWarnings);
        if (validation.output === "strict") {
          return {
            ok: false,
            error: { type: "validation", phase: "output", data: responseData, errors: outputWarnings },
            ...base,
          } as TResult;
        }
      }
    }

    if (!isOk) {
      return {
        ok: false,
        error: { type: "http", status: response.status, matchedStatus, data: responseData },
        ...base,
      } as TResult;
    }

    return { ok: true, data: responseData, warnings, ...base } as TResult;
  } catch (err) {
    if (hasTimeout && err instanceof DOMException && err.name === "AbortError") {
      const response = new Response(null, { status: 408, statusText: "Timeout" });
      return {
        ok: false,
        status: 408,
        contentType: "other" as ContentCategory,
        rawContentType: "",
        error: { type: "timeout", timeoutMs: timeout as number },
        response,
      } as TResult;
    }

    const response = new Response(null, { status: 502, statusText: "Network Error" });
    return {
      ok: false,
      status: 502,
      contentType: "other" as ContentCategory,
      rawContentType: "",
        error: { type: "network", cause: err },
        response,
      } as TResult;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
