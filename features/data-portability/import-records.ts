import "server-only";

import type { PortableColumn, PortableDefinition } from "./portable-collections";

export type ImportIssue = { row: number; field?: string; message: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function formatDate(value: unknown, includeTime: boolean) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return includeTime ? value.toISOString() : value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new Error("must be a valid date");
  return includeTime ? parsed.toISOString() : parsed.toISOString().slice(0, 10);
}

function coerce(value: unknown, column: PortableColumn) {
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "" || raw === null || raw === undefined) return undefined;
  switch (column.kind) {
    case "number": {
      const parsed = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.+-]/g, ""));
      if (!Number.isFinite(parsed)) throw new Error("must be a number");
      return parsed;
    }
    case "integer": {
      const parsed = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9+-]/g, ""));
      if (!Number.isInteger(parsed)) throw new Error("must be a whole number");
      return parsed;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      const lowered = String(raw).toLowerCase();
      if (["true", "yes", "1"].includes(lowered)) return true;
      if (["false", "no", "0"].includes(lowered)) return false;
      throw new Error("must be true/false, yes/no or 1/0");
    }
    case "date": return formatDate(raw, false);
    case "datetime": return formatDate(raw, true);
    case "uuid": {
      const text = String(raw);
      if (!uuidPattern.test(text)) throw new Error("must be a valid UUID");
      return text;
    }
    default: return String(raw);
  }
}

export function normalizeImportedRows(definition: PortableDefinition, headers: string[], rows: unknown[][]) {
  const columns = definition.importColumns;
  if (!columns) return { records: [], issues: [{ row: 1, message: `${definition.label} cannot be imported.` }], fatal: true };

  const headerPositions = new Map(headers.map((header, index) => [normalizedHeader(header), index]));
  const fieldPositions = new Map<string, number>();
  for (const field of columns) {
    const position = headerPositions.get(normalizedHeader(field.key)) ?? headerPositions.get(normalizedHeader(field.label));
    if (position !== undefined) fieldPositions.set(field.key, position);
  }
  const missingHeaders = columns.filter((item) => item.required && !fieldPositions.has(item.key));
  if (missingHeaders.length) {
    return {
      records: [],
      issues: missingHeaders.map((item) => ({ row: 1, field: item.label, message: `Required column “${item.label}” is missing.` })),
      fatal: true,
    };
  }

  const issues: ImportIssue[] = [];
  const records: Record<string, unknown>[] = [];
  rows.forEach((row, index) => {
    const record: Record<string, unknown> = {};
    let valid = true;
    for (const field of columns) {
      const position = fieldPositions.get(field.key);
      const raw = position === undefined ? undefined : row[position];
      try {
        const value = coerce(raw, field);
        if (value === undefined) {
          if (field.required) {
            issues.push({ row: index + 2, field: field.label, message: `${field.label} is required.` });
            valid = false;
          }
        } else record[field.key] = value;
      } catch (error) {
        issues.push({ row: index + 2, field: field.label, message: `${field.label} ${error instanceof Error ? error.message : "is invalid"}.` });
        valid = false;
      }
    }
    if (valid) records.push(record);
  });
  return { records, issues, fatal: false };
}
