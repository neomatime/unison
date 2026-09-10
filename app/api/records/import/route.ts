import { NextResponse } from "next/server";

import { parseTabularFile } from "@/features/data-portability/file-formats";
import { normalizeImportedRows } from "@/features/data-portability/import-records";
import { isPortableCollection, portableDefinitions } from "@/features/data-portability/portable-collections";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const maxFileSize = 10 * 1024 * 1024;
const maxRows = 5000;

export async function POST(request: Request) {
  try {
    const { organization, user } = await getSessionContext();
    const form = await request.formData();
    const collection = String(form.get("collection") ?? "");
    const file = form.get("file");
    const commit = form.get("commit") === "true";
    if (!isPortableCollection(collection)) return NextResponse.json({ message: "Unknown import collection." }, { status: 400 });
    const definition = portableDefinitions[collection];
    if (!definition.importColumns) return NextResponse.json({ message: `${definition.label} cannot be imported.` }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ message: "Choose a CSV or XLSX file." }, { status: 400 });
    if (file.size <= 0 || file.size > maxFileSize) return NextResponse.json({ message: "The file must be between 1 byte and 10 MB." }, { status: 400 });
    const extension = file.name.toLowerCase().endsWith(".csv") ? "csv" : file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : null;
    if (!extension) return NextResponse.json({ message: "Only CSV and XLSX files are supported." }, { status: 400 });

    const parsed = await parseTabularFile(Buffer.from(await file.arrayBuffer()), extension);
    if (!parsed.headers.length) return NextResponse.json({ message: "The file must contain a header row." }, { status: 400 });
    if (!parsed.rows.length) return NextResponse.json({ message: "The file contains no data rows." }, { status: 400 });
    if (parsed.rows.length > maxRows) return NextResponse.json({ message: `The file contains ${parsed.rows.length} rows; the maximum is ${maxRows}.` }, { status: 400 });

    const normalized = normalizeImportedRows(definition, parsed.headers, parsed.rows);
    const summary = {
      fileName: file.name,
      collection: definition.label,
      rowCount: parsed.rows.length,
      validCount: normalized.records.length,
      skippedCount: parsed.rows.length - normalized.records.length,
      headers: parsed.headers,
      requiredColumns: definition.importColumns.filter((item) => item.required).map((item) => item.label),
      preview: normalized.records.slice(0, 5),
      issues: normalized.issues.slice(0, 100),
      fatal: normalized.fatal,
    };
    if (!commit) return NextResponse.json(summary);
    if (normalized.fatal || !normalized.records.length) return NextResponse.json({ ...summary, message: "There are no valid rows to import." }, { status: 422 });

    const supabase = await createServerSupabase();
    const records = normalized.records.map((record) => ({ ...record, organization_id: organization.id }));
    const { error } = await (supabase as any).from(definition.table).insert(records);
    if (error) {
      await (supabase as any).from("data_import_jobs").insert({
        organization_id: organization.id, collection, file_name: file.name, file_type: extension,
        status: "Failed", row_count: parsed.rows.length, imported_count: 0,
        skipped_count: parsed.rows.length, errors: [{ row: 0, message: error.message }], created_by: user.id,
      });
      return NextResponse.json({ ...summary, message: error.message }, { status: 422 });
    }

    await Promise.all([
      (supabase as any).from("data_import_jobs").insert({
        organization_id: organization.id, collection, file_name: file.name, file_type: extension,
        status: normalized.issues.length ? "Completed with warnings" : "Completed",
        row_count: parsed.rows.length, imported_count: normalized.records.length,
        skipped_count: parsed.rows.length - normalized.records.length, errors: normalized.issues, created_by: user.id,
      }),
      (supabase as any).from("notifications").insert({
        organization_id: organization.id, user_id: user.id, category: "Import",
        title: `${normalized.records.length} ${definition.label.toLowerCase()} imported`,
        body: normalized.issues.length ? `${normalized.issues.length} validation issue${normalized.issues.length === 1 ? "" : "s"} were skipped.` : `${file.name} completed without validation issues.`,
      }),
    ]);
    return NextResponse.json({ ...summary, importedCount: normalized.records.length, committed: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "The import could not be completed." }, { status: 500 });
  }
}
