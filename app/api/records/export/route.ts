import { NextResponse } from "next/server";

import { buildCsv, buildPdf, buildXlsx } from "@/features/data-portability/file-formats";
import { isPortableCollection, portableDefinitions } from "@/features/data-portability/portable-collections";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const { organization } = await getSessionContext();
    const url = new URL(request.url);
    const collection = url.searchParams.get("collection");
    const format = url.searchParams.get("format")?.toLowerCase();
    if (!isPortableCollection(collection)) return NextResponse.json({ message: "Unknown export collection." }, { status: 400 });
    if (!format || !["csv", "xlsx", "pdf"].includes(format)) return NextResponse.json({ message: "Choose CSV, XLSX or PDF." }, { status: 400 });
    const definition = portableDefinitions[collection];
    const ids = (url.searchParams.get("ids") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    if (ids.some((id) => !uuidPattern.test(id))) return NextResponse.json({ message: "The export contains an invalid record identifier." }, { status: 400 });

    const supabase = await createServerSupabase();
    let query = (supabase as any)
      .from(definition.table)
      .select(definition.columns.map((item) => item.key).join(","))
      .eq("organization_id", organization.id)
      .order(definition.orderBy, { ascending: false })
      .limit(5000);
    if (ids.length) query = query.in("id", ids.slice(0, 5000));
    const { data, error } = await query;
    if (error) return NextResponse.json({ message: error.message }, { status: 422 });
    const rows = (data ?? []) as Record<string, unknown>[];

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
