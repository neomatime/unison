import { NextResponse } from "next/server";

import { buildCsv, buildPdf, buildXlsx } from "@/features/data-portability/file-formats";
import { isPortableCollection, portableDefinitions } from "@/features/data-portability/portable-collections";
import { applyRegisterFilters, applyRegisterOrder } from "@/features/registers/apply-filters";
import { EXPORT_LIMIT, EXPORT_TOO_MANY, isOverCap, readAllRows, readExportRequest } from "@/features/registers/export-query";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const { organization } = await getSessionContext();
    const url = new URL(request.url);
    const collection = url.searchParams.get("collection");
    const exportRequest = readExportRequest(url.searchParams);
    const format = exportRequest.format;
    if (!isPortableCollection(collection)) return NextResponse.json({ message: "Unknown export collection." }, { status: 400 });
    if (!format) return NextResponse.json({ message: "Choose CSV, XLSX or PDF." }, { status: 400 });
    const definition = portableDefinitions[collection];
    const ids = (url.searchParams.get("ids") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    if (ids.some((id) => !uuidPattern.test(id))) return NextResponse.json({ message: "The export contains an invalid record identifier." }, { status: 400 });

    const supabase = await createServerSupabase();
    const columns = definition.columns.map((item) => item.key).join(",");
    const { kind, params } = exportRequest;
    // The same filters for the count and for every page of rows. A register export is everything that matches the page's
    // filters, whichever page the person was on (`ids` is ignored); applyRegisterFilters scopes by organisation.
    const scope = (builder: any) => {
      if (kind && params) return applyRegisterFilters(builder, kind, params, organization.id);
      const scoped = builder.eq("organization_id", organization.id);
      return ids.length ? scoped.in("id", ids.slice(0, EXPORT_LIMIT)) : scoped;
    };
    const order = (builder: any) => (kind && params ? applyRegisterOrder(builder, kind, params) : builder.order(definition.orderBy, { ascending: false }).order("id", { ascending: true }));

    // The server answers at most 1,000 rows per request whatever limit() asks for, so the size is decided from an exact
    // count first, and the rows are then read range by range.
    const counted = await scope((supabase as any).from(definition.table).select(columns, { count: "exact", head: true }));
    if (counted.error) return NextResponse.json({ message: counted.error.message }, { status: 422 });
    if (typeof counted.count !== "number") return NextResponse.json({ message: "The export could not be prepared." }, { status: 500 });
    if (isOverCap(counted.count)) return NextResponse.json({ message: EXPORT_TOO_MANY }, { status: 413 });
    const read = await readAllRows<Record<string, unknown>>(
      (from, to) => order(scope((supabase as any).from(definition.table).select(columns))).range(from, to),
      counted.count,
    );
    if (read.error) return NextResponse.json({ message: read.error }, { status: 422 });
    if (read.tooMany) return NextResponse.json({ message: EXPORT_TOO_MANY }, { status: 413 });
    const rows = read.rows;

    let bytes: Buffer;
    let mime: string;
    if (format === "csv") {
      bytes = buildCsv(definition.columns, rows);
      mime = "text/csv; charset=utf-8";
    } else if (format === "xlsx") {
      bytes = await buildXlsx(definition.label, definition.columns, rows);
      mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      bytes = await buildPdf(`${definition.label} export`, definition.columns, rows);
      mime = "application/pdf";
    }

    const date = new Date().toISOString().slice(0, 10);
    const filename = `unison-${collection}-${date}.${format}`;
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "The export could not be prepared." }, { status: 500 });
  }
}
