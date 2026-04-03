import type { CsvParseOptions, CsvParseResult, CsvSchema, RequestConfig, ValidationWarning } from "./types.js";
import { resolveValidationConfig } from "./validation.js";

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function chooseDelimiter(csv: string, override: string | undefined): string {
  if (override) return override;
  const header = csv.split(/\r?\n/, 1)[0] ?? "";
  const delimiters = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const delimiter of delimiters) {
    const count = splitCsvLine(header, delimiter).length;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

function parseCsvRows(csv: string, delimiter: string): Record<string, string>[] {
  const lines = csv
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]!, delimiter);
  const rows: Record<string, string>[] = [];

  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]!] = fields[i] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

export function parseCsv<T extends Record<string, unknown> = Record<string, unknown>>(
  csv: string,
  schema: CsvSchema | undefined,
  options: CsvParseOptions | undefined,
  clientValidation: RequestConfig["validation"],
): CsvParseResult<T> {
  const rowsRaw = parseCsvRows(csv, chooseDelimiter(csv, options?.delimiter));

  const mode = options?.validation ?? resolveValidationConfig(clientValidation, undefined).csv;

  if (!schema) {
    return { ok: true, data: rowsRaw as T[], warnings: [] };
  }

  const rows: T[] = [];
  const warnings: ValidationWarning[] = [];

  for (let i = 0; i < rowsRaw.length; i++) {
    const row = rowsRaw[i]!;
    const typed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      const fieldType = schema[key];
      if (value === "" || value === undefined || value === null) {
        typed[key] = fieldType === "number" ? null : fieldType === "boolean" ? false : value;
      } else if (fieldType === "number") {
        const num = Number(value);
        if (Number.isNaN(num) && mode !== "off") {
          warnings.push({ phase: "csv", path: `row[${i}].${key}`, message: `Expected number but got "${value}"` });
        }
        typed[key] = num;
      } else if (fieldType === "boolean") {
        const lower = value.toLowerCase();
        if (lower !== "true" && lower !== "false" && value !== "1" && value !== "0" && mode !== "off") {
          warnings.push({ phase: "csv", path: `row[${i}].${key}`, message: `Expected boolean but got "${value}"` });
        }
        typed[key] = lower === "true" || value === "1";
      } else {
        typed[key] = value;
      }
    }

    rows.push(typed as T);
  }

  if (mode === "strict" && warnings.length > 0) {
    return { ok: false, errors: warnings };
  }

  return { ok: true, data: rows, warnings };
}
