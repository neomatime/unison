import "server-only";

import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

function pdfSafe(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[–—]/g, "-")
    .replace(/·/g, "|")
    .replace(/[^\x20-\x7E\n\r]/g, "?");
}

function wrap(text: string, maxCharacters: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length; index += maxCharacters) lines.push(word.slice(index, index + maxCharacters));
      line = "";
    } else if (!line || `${line} ${word}`.length <= maxCharacters) {
      line = line ? `${line} ${word}` : word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function buildPdf(title: string, columns: PortableColumn[], rows: TabularRow[]) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 42;
  const contentWidth = pageSize[0] - margin * 2;
  let page = document.addPage(pageSize);
  let y = pageSize[1] - margin;

  const nextPage = () => {
    page = document.addPage(pageSize);
    y = pageSize[1] - margin;
  };
  const ensure = (height: number) => { if (y - height < margin) nextPage(); };
  const drawLines = (lines: string[], x: number, size: number, lineHeight: number, font = regular, color = rgb(0.18, 0.24, 0.32)) => {
    for (const line of lines) {
      page.drawText(line, { x, y, size, font, color, maxWidth: contentWidth });
      y -= lineHeight;
    }
  };

  drawLines(wrap(pdfSafe(title), 58), margin, 18, 23, bold, rgb(0.06, 0.13, 0.23));
  y -= 3;
  drawLines([`${rows.length} record${rows.length === 1 ? "" : "s"} | Generated ${new Date().toISOString()}`], margin, 8, 13, regular, rgb(0.38, 0.45, 0.55));
  y -= 12;

  if (!rows.length) {
    drawLines(["No records matched the selected export scope."], margin, 10, 15);
  }

  rows.forEach((row, rowIndex) => {
    const estimated = 30 + columns.reduce((total, item) => total + Math.max(1, wrap(pdfSafe(row[item.key]), 82).length) * 12, 0);
    ensure(Math.min(estimated, 160));
    page.drawRectangle({ x: margin, y: y - 18, width: contentWidth, height: 22, color: rgb(0.94, 0.95, 0.97) });
    drawLines([`Record ${rowIndex + 1}`], margin + 8, 10, 28, bold, rgb(0.06, 0.13, 0.23));
    for (const item of columns) {
      const valueLines = wrap(pdfSafe(row[item.key]) || "-", 82);
      ensure(valueLines.length * 12 + 15);
      drawLines([pdfSafe(item.label).toUpperCase()], margin, 7, 10, bold, rgb(0.38, 0.45, 0.55));
      drawLines(valueLines, margin, 9, 12);
      y -= 4;
    }
    y -= 10;
  });

  return Buffer.from(await document.save());
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
