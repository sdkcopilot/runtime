export type ValidationPhase = "input" | "output" | "csv";
export type ValidationMode = "strict" | "warn" | "off";
export interface ValidationConfigObject {
  input?: ValidationMode;
  output?: ValidationMode;
  csv?: ValidationMode;
}
export type ValidationConfig = ValidationMode | ValidationConfigObject;

export interface RequestConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
  auth?: AuthConfig;
  fetch?: (input: Request) => Promise<Response>;
  validation?: ValidationConfig;
  onRequest?: (req: Request) => void;
  onResponse?: (res: Response) => void;
  onValidationWarning?: (warnings: ValidationWarning[]) => void;
}

export interface RequestParams {
  method: string;
  path: string;
  pathParams?: Record<string, unknown>;
  queryParams?: Record<string, unknown>;
  headers?: Record<string, string>;
  cookies?: Record<string, unknown>;
  body?: unknown;
  contentType?: string;
  auth?: AuthConfig;
  /** Per-operation base URL override (for path/operation-level servers) */
  baseUrl?: string;
  /** Query parameter serialization styles */
  queryStyles?: Record<string, { style: string; explode: boolean }>;
  validation?: ValidationConfig;
}

export type AuthConfig = {
  bearer?: string;
  apiKey?: { value: string; in: "header" | "query" | "cookie"; name: string };
  basic?: { user: string; pass: string };
  oauth2?: { accessToken: string };
} | null;

export interface ValidationWarning {
  phase: ValidationPhase;
  path: string;
  message: string;
}

export type ContentCategory = "json" | "text" | "csv" | "xml" | "binary" | "form" | "other";

export interface RuntimeResultBase {
  contentType: ContentCategory;
  rawContentType: string;
  response: Response;
}

export type HttpError<TErrors extends Record<string, unknown> = Record<string, unknown>> =
  { [K in keyof TErrors & string]: { type: "http"; status: number; matchedStatus: K; data: TErrors[K] } }[keyof TErrors & string];

export type RuntimeError<TErrors extends Record<string, unknown> = Record<string, unknown>> =
  | HttpError<TErrors>
  | { type: "validation"; phase: ValidationPhase; data: unknown; errors: ValidationWarning[] }
  | { type: "timeout"; timeoutMs: number }
  | { type: "network"; cause: unknown };

export type RuntimeSuccessBase =
  RuntimeResultBase & { ok: true; status: number; warnings: ValidationWarning[] };

export type RuntimeFailure<TErrors extends Record<string, unknown> = Record<string, unknown>> =
  RuntimeResultBase & { ok: false; status: number; error: RuntimeError<TErrors> };

export type RuntimeResult<T, TErrors extends Record<string, unknown> = Record<string, unknown>> =
  | (RuntimeSuccessBase & { data: T })
  | RuntimeFailure<TErrors>;
