export type ValidationPhase = "input" | "output" | "csv";
export type ValidationMode = "strict" | "warn" | "off";

export interface ValidationConfigObject {
  input?: ValidationMode;
  output?: ValidationMode;
  csv?: ValidationMode;
}

export type ValidationConfig = ValidationMode | ValidationConfigObject;

export interface ValidationWarning {
  phase: ValidationPhase;
  path: string;
  message: string;
}

export interface ValidatorFn {
  (data: unknown, opts?: { instancePath?: string }): boolean;
  errors: { instancePath: string; message?: string }[] | null;
}

export type AuthConfig = {
  bearer?: string;
  apiKey?: { value: string; in: "header" | "query" | "cookie"; name: string };
  basic?: { user: string; pass: string };
  oauth2?: { accessToken: string };
} | null;

export interface RequestConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
  auth?: AuthConfig;
  fetch?: (url: URL, init: RequestInit) => Promise<Response>;
  validation?: ValidationConfig;
  onRequest?: (url: URL, init: RequestInit) => void;
  onResponse?: (res: Response) => void;
  onValidationWarning?: (warnings: ValidationWarning[]) => void;
}

export interface OperationRequest {
  path?: unknown;
  query?: unknown;
  headers?: unknown;
  cookies?: unknown;
  body?: unknown;
  contentType?: string;
  auth?: AuthConfig;
  validation?: ValidationConfig;
}

export interface RequestParams<T extends OperationRequest = OperationRequest> {
  method: string;
  path: string;
  baseUrl?: string;
  queryStyles?: Record<string, { style: string; explode: boolean }>;
  validators?: Record<string, ValidatorFn>;
  inputValidators?: {
    path?: ValidatorFn;
    query?: ValidatorFn;
    headers?: ValidatorFn;
    cookies?: ValidatorFn;
    body?: ValidatorFn | Record<string, ValidatorFn>;
  };
  bodyRequired?: boolean;
  params: T;
}

export interface Operation<TParams, TResult> {
  (params: TParams): TResult;
}

export interface OperationNoParams<TResult> {
  (): TResult;
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

export type CsvFieldType = "string" | "number" | "boolean";
export type CsvSchema = Record<string, CsvFieldType>;

export interface CsvParseOptions {
  delimiter?: string;
  validation?: ValidationMode;
}

export type CsvParseResult<T> =
  | { ok: true; data: T[]; warnings: ValidationWarning[] }
  | { ok: false; errors: ValidationWarning[] };
