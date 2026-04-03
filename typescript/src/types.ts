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
  fetch?: (input: Request) => Promise<Response>;
  validation?: ValidationConfig;
  onRequest?: (req: Request) => void;
  onResponse?: (res: Response) => void;
  onValidationWarning?: (warnings: ValidationWarning[]) => void;
}

export interface BuilderTypes {
  Path: unknown;
  Query: unknown;
  Headers: unknown;
  Cookies: unknown;
  Body: unknown;
  ContentType: string;
  Result: unknown;
}

export interface OperationParams<T extends BuilderTypes = BuilderTypes> {
  path?: T["Path"];
  query?: T["Query"];
  headers?: T["Headers"];
  cookies?: T["Cookies"];
  body?: T["Body"];
  contentType?: T["ContentType"];
  auth?: AuthConfig;
  validation?: ValidationConfig;
}

export interface RequestParams<T extends BuilderTypes = BuilderTypes> {
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
  params: OperationParams<T>;
}

export type PublicBuilder<T> = Pick<T, {
  [K in keyof T]: K extends `_${string}` ? never : K;
}[keyof T]>;

export class RequestBuilder<T extends BuilderTypes = BuilderTypes> {
  /** @internal */ _path: T["Path"] = {} as T["Path"];
  /** @internal */ _query: T["Query"] = {} as T["Query"];
  /** @internal */ _headers: T["Headers"] = {} as T["Headers"];
  /** @internal */ _cookies: T["Cookies"] = {} as T["Cookies"];
  /** @internal */ _body: T["Body"] = undefined as T["Body"];
  /** @internal */ _contentType: T["ContentType"] | undefined = undefined;
  /** @internal */ _auth: AuthConfig | undefined = undefined;
  /** @internal */ _validation: ValidationConfig | undefined = undefined;
  /** @internal */ _getConfig: () => RequestConfig;
  /** @internal */ _execute: (config: RequestConfig, params: {
    path: T["Path"];
    query: T["Query"];
    headers: T["Headers"];
    cookies: T["Cookies"];
    body: T["Body"];
    contentType: T["ContentType"] | undefined;
    auth: AuthConfig | undefined;
    validation: ValidationConfig | undefined;
  }) => Promise<T["Result"]>;

  constructor(
    getConfig: () => RequestConfig,
    execute: (config: RequestConfig, params: {
      path: T["Path"];
      query: T["Query"];
      headers: T["Headers"];
      cookies: T["Cookies"];
      body: T["Body"];
      contentType: T["ContentType"] | undefined;
      auth: AuthConfig | undefined;
      validation: ValidationConfig | undefined;
    }) => Promise<T["Result"]>,
  ) {
    this._getConfig = getConfig;
    this._execute = execute;
  }

  _setPath(params: T["Path"]): this {
    this._path = params;
    return this;
  }

  _setQuery(params: T["Query"]): this {
    this._query = params;
    return this;
  }

  _setHeaders(params: T["Headers"]): this {
    this._headers = params;
    return this;
  }

  _setCookies(params: T["Cookies"]): this {
    this._cookies = params;
    return this;
  }

  _setBody(data: T["Body"]): this {
    this._body = data;
    return this;
  }

  _setContentType(type: T["ContentType"]): this {
    this._contentType = type;
    return this;
  }

  _setAuth(override: AuthConfig): this {
    this._auth = override;
    return this;
  }

  _setValidation(override: ValidationConfig): this {
    this._validation = override;
    return this;
  }

  async exec(): Promise<T["Result"]> {
    return this._execute(this._getConfig(), {
      path: this._path,
      query: this._query,
      headers: this._headers,
      cookies: this._cookies,
      body: this._body,
      contentType: this._contentType,
      auth: this._auth,
      validation: this._validation,
    });
  }
}

export interface Operation<TParams, TResult, TBuilder> {
  (params: TParams): TResult;
  builder(): TBuilder;
}

export interface OperationNoParams<TResult, TBuilder> {
  (): TResult;
  builder(): TBuilder;
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
