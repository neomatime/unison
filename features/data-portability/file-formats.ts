import "server-only";

import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { createElement } from "react";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { PDF_FONT_FAMILY } from "../documents/pdf/render-document-pdf";
import { allowLongRunsToWrap, pdfText } from "../documents/pdf/pdf-text";

import type { PortableColumn } from "./portable-collections";

export type TabularRow = Record<string, unknown>;

const dangerousSpreadsheetPrefix = /^[=+@\t\r]|^-(?!\d)/;

function spreadsheetSafe(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = value instanceof Date ? value.toISOString() : String(value);
  return dangerousSpreadsheetPrefix.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  const text = String(spreadsheetSafe(value));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildCsv(columns: PortableColumn[], rows: TabularRow[]) {
  const lines = [columns.map((item) => csvCell(item.label)).join(",")];
  for (const row of rows) lines.push(columns.map((item) => csvCell(row[item.key])).join(","));
  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

export async function buildXlsx(title: string, columns: PortableColumn[], rows: TabularRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UNISON";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(title.slice(0, 31) || "Records", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = columns.map((item) => ({
    header: item.label,
    key: item.key,
    width: Math.min(42, Math.max(14, item.label.length + 3)),
  }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10203A" } };
  sheet.getRow(1).alignment = { vertical: "middle" };
  sheet.getRow(1).height = 24;
  for (const row of rows) {
    const inserted = sheet.addRow(Object.fromEntries(columns.map((item) => [item.key, spreadsheetSafe(row[item.key])])));
    inserted.alignment = { vertical: "top", wrapText: true };
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } };
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

const pdfInk = "#10203a";
const pdfMuted = "#61738c";
const pdfBody = "#2e3d52";

/** Text for the PDF: control characters dropped, and a long unbroken run (a reference, an address) allowed to wrap. */
function pdfSafe(value: unknown) {
  return allowLongRunsToWrap(pdfText(value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value)));
}

// Set in Carlito, like every other PDF UNISON makes. Written with createElement so no JSX is needed in a .ts file.
export async function buildPdf(title: string, columns: PortableColumn[], rows: TabularRow[]) {
  const text = (style: Record<string, unknown>, ...children: unknown[]) => createElement(Text, { style: { fontFamily: PDF_FONT_FAMILY, ...style } }, ...(children as never[]));
  const record = (row: TabularRow, index: number) =>
    createElement(
      View,
      { key: index, style: { marginBottom: 12 }, wrap: true },
      createElement(View, { wrap: false, style: { backgroundColor: "#f0f2f7", paddingVertical: 5, paddingHorizontal: 8, marginBottom: 6 } }, text({ fontSize: 10, fontWeight: 700, color: pdfInk }, `Record ${index + 1}`)),
      ...columns.map((item) =>
        createElement(
          View,
          { key: item.key, wrap: false, style: { marginBottom: 4 } },
          text({ fontSize: 7, fontWeight: 700, letterSpacing: 0.8, color: pdfMuted }, pdfSafe(item.label).toUpperCase()),
          text({ fontSize: 9.5, color: pdfBody, lineHeight: 1.3 }, pdfSafe(row[item.key]) || "-"),
        ),
      ),
    );

  const body = createElement(
    Document,
    { title: pdfSafe(title), author: "UNISON" },
    createElement(
      Page,
      { size: "A4", style: { paddingVertical: 42, paddingHorizontal: 42 } },
      text({ fontSize: 18, fontWeight: 700, color: pdfInk, marginBottom: 4 }, pdfSafe(title)),
      text({ fontSize: 8.5, color: pdfMuted, marginBottom: 14 }, `${rows.length} record${rows.length === 1 ? "" : "s"} | Generated ${new Date().toISOString()}`),
      ...(rows.length ? rows.map(record) : [text({ fontSize: 10.5, color: pdfBody }, "No records matched the selected export scope.")]),
    ),
  );
  return Buffer.from(await renderToBuffer(body));
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("result" in value && value.result !== undefined) return value.result;
  if ("text" in value) return value.text;
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  return String(value);
}

export async function parseTabularFile(buffer: Buffer, extension: "csv" | "xlsx") {
  const workbook = new ExcelJS.Workbook();
  if (extension === "xlsx") await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
  else await workbook.csv.read(Readable.from(buffer));
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The file does not contain a worksheet.");
  const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((value) => String(cellValue(value)).trim());
  const rows: unknown[][] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as ExcelJS.CellValue[]).slice(1, headers.length + 1).map(cellValue);
    if (values.some((value) => String(value ?? "").trim() !== "")) rows.push(values);
  });
  return { headers, rows };
}
