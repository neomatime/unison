"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import type { PhaseSixKind } from "../queries/phase-six";
import { readBillingTerms } from "@/features/documents/billing-terms";
import { documentErrorMessage } from "@/features/documents/errors";
import { readDocumentExtras } from "@/features/documents/fields";
import {
  QUOTE_DRAFT_STATUSES,
  QUOTE_SENT_STATUSES,
  isDraftStatus,
} from "@/features/documents/vocabulary";

export type PhaseSixActionState = { error?: string } | undefined;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => text(form, key) || null;
const identifier = (form: FormData, key: string) => {
  const value = optional(form, key);
  return value && isUuid(value) ? value : null;
};
const number = (form: FormData, key: string, fallback = 0) => {
  const value = optional(form, key);
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const routes: Record<PhaseSixKind, string> = {
  lead: "/commercial/leads",
  quote: "/commercial/quotes",
  opportunity: "/commercial/sales",
  invoice: "/finance/invoices",
  expense: "/finance/expenses",
  forecast: "/finance/forecast",
};

async function clientName(
  db: any,
  organizationId: string,
  form: FormData,
) {
  const clientId = identifier(form, "clientId");
  let name = text(form, "clientName");
  if (clientId) {
    const result = await db
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (result.error || !result.data) return { clientId, name: "", invalid: true };
    name = result.data.name;
  }
  return { clientId, name, invalid: false };
}

const isOneOf = (options: readonly string[], candidate: string) => options.includes(candidate);

/** The stored status and total of a quote or invoice, so a sent or issued document is saved differently. */
async function readDocumentState(db: any, table: string, organizationId: string, id: string) {
  const result = await db
    .from(table)
    .select("status,total_amount")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return { status: String(result.data.status), total: Number(result.data.total_amount) };
}

export async function savePhaseSixRecordAction(
  kind: PhaseSixKind,
  id: string | undefined,
  _previous: PhaseSixActionState,
  form: FormData,
): Promise<PhaseSixActionState> {
  const { organization } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  let table: string;
  let values: Record<string, unknown>;

  if (kind === "lead") {
    const companyName = text(form, "companyName");
    const contactName = text(form, "contactName");
    const contactEmail = optional(form, "contactEmail");
    if (!companyName || !contactName) {
      return { error: "Company and primary contact are required." };
    }
    if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) {
      return { error: "Enter a valid contact email." };
    }
    table = "leads";
    values = {
      organization_id: organization.id,
      company_name: companyName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: optional(form, "contactPhone"),
      source: text(form, "source") || "Referral",
      owner_id: identifier(form, "ownerId"),
      estimated_value: Math.max(0, number(form, "estimatedValue")),
      currency: text(form, "currency") || "ZAR",
      status: text(form, "status") || "New",
      last_activity_at: new Date().toISOString(),
      notes: optional(form, "notes"),
    };
  } else if (kind === "opportunity") {
    const name = text(form, "name");
    const resolvedClient = await clientName(db, organization.id, form);
    if (resolvedClient.invalid) return { error: "The selected client could not be verified." };
    if (!name || !resolvedClient.name) {
      return { error: "Opportunity name and client or prospect are required." };
    }
    const stage = text(form, "stage") || "Discovery";
    if (stage === "Lost" && !optional(form, "lostReason")) {
      return { error: "Say why this opportunity was lost." };
    }
    table = "sales_opportunities";
    values = {
      organization_id: organization.id,
      name,
      client_id: resolvedClient.clientId,
      client_name: resolvedClient.name,
      lead_id: identifier(form, "leadId"),
      owner_id: identifier(form, "ownerId"),
      stage,
      expected_value: Math.max(0, number(form, "expectedValue")),
      currency: text(form, "currency") || "ZAR",
      probability_percent: Math.min(100, Math.max(0, number(form, "probabilityPercent"))),
      expected_close: optional(form, "expectedClose"),
      next_step: optional(form, "nextStep"),
      lost_reason: stage === "Lost" ? optional(form, "lostReason") : null,
      won_at: stage === "Won" ? new Date().toISOString() : null,
      notes: optional(form, "notes"),
    };
  } else if (kind === "quote") {
    const extras = readDocumentExtras(form);
    if ("error" in extras) return { error: extras.error };
    const state = id && isUuid(id) ? await readDocumentState(db, "quotes", organization.id, id) : null;
    if (id && isUuid(id) && !state) return { error: "That quote could not be loaded." };
    const status = text(form, "status");
    table = "quotes";
    if (state && !isDraftStatus("quote", state.status)) {
      // Sent: only the status and the notes can change; the database refuses everything else.
      // An old edit form posted after the quote went out carries no status or a draft one: say it is frozen.
      if (!status || isOneOf(QUOTE_DRAFT_STATUSES, status)) {
        return { error: documentErrorMessage("QUOTE_FROZEN") ?? "This quote has already been sent and can no longer be edited." };
      }
      // Superseded is set by the database when a revision goes out, never by hand; a form that posts it back unchanged is fine.
      if (!isOneOf(QUOTE_SENT_STATUSES, status) || (status === "Superseded" && state.status !== "Superseded")) return { error: "Choose Sent, Accepted, Declined or Expired." };
      values = { status, notes: optional(form, "notes") };
    } else {
      if (status && !isOneOf(QUOTE_DRAFT_STATUSES, status)) {
        return { error: "A draft quote is Draft or Internal Review. Use Send quote to send it." };
      }
      const resolvedClient = await clientName(db, organization.id, form);
      if (resolvedClient.invalid) return { error: "The selected client could not be verified." };
      if (!resolvedClient.name) return { error: "Choose a client or enter a prospect name." };
      const contact = optional(form, "contactName");
      if (contact && contact.length > 200) return { error: "The client contact is too long (200 characters at most)." };
      // The start date and term of the monthly charge: both or neither, and only a draft carries them (a sent quote's are frozen).
      const terms = readBillingTerms(form);
      if ("error" in terms) return { error: terms.error };
      values = {
        organization_id: organization.id,
        client_id: resolvedClient.clientId,
        client_name: resolvedClient.name,
        contact_name: contact,
        lead_id: identifier(form, "leadId"),
        opportunity_id: identifier(form, "opportunityId"),
        owner_id: identifier(form, "ownerId"),
        valid_until: optional(form, "validUntil"),
        currency: text(form, "currency") || "ZAR",
        status: status || "Draft",
        terms: optional(form, "terms"),
        notes: optional(form, "notes"),
        ...extras,
        ...terms,
      };
    }
  } else if (kind === "invoice") {
    const extras = readDocumentExtras(form);
    if ("error" in extras) return { error: extras.error };
    const state = id && isUuid(id) ? await readDocumentState(db, "invoices", organization.id, id) : null;
    if (id && isUuid(id) && !state) return { error: "That invoice could not be loaded." };
    table = "invoices";
    if (state && !isDraftStatus("invoice", state.status)) {
      // Issued: only the notes can change; the balance and the payment state come from the payments (record_payment,
      // void_payment) and cancelling is cancel_invoice. An old draft form posted after the invoice was issued carries
      // the draft's fields: say it is frozen.
      if (form.has("dueDate") || form.has("clientId")) {
        return { error: documentErrorMessage("INVOICE_FROZEN") ?? "This invoice has already been issued and can no longer be edited." };
      }
      values = { notes: optional(form, "notes") };
    } else {
      const resolvedClient = await clientName(db, organization.id, form);
      if (resolvedClient.invalid) return { error: "The selected client could not be verified." };
      if (!resolvedClient.name) return { error: "Choose a client." };
      const contact = optional(form, "contactName");
      if (contact && contact.length > 200) return { error: "The client contact is too long (200 characters at most)." };
      values = {
        organization_id: organization.id,
        client_id: resolvedClient.clientId,
        client_name: resolvedClient.name,
        contact_name: contact,
        project_id: identifier(form, "projectId"),
        quote_id: identifier(form, "quoteId"),
        opportunity_id: identifier(form, "opportunityId"),
        owner_id: identifier(form, "ownerId"),
        due_date: optional(form, "dueDate"),
        currency: text(form, "currency") || "ZAR",
        status: "Draft",
        payment_terms: optional(form, "paymentTerms"),
        notes: optional(form, "notes"),
        ...extras,
      };
    }
  } else if (kind === "expense") {
    const description = text(form, "description");
    const amount = number(form, "amount", -1);
    const expenseDate = text(form, "expenseDate");
    if (!description || amount < 0 || !expenseDate) {
      return { error: "Description, non-negative amount and expense date are required." };
    }
    const status = text(form, "status") || "Draft";
    table = "expenses";
    values = {
      organization_id: organization.id,
      description,
      category: text(form, "category") || "Other",
      vendor_id: identifier(form, "vendorId"),
      vendor_name: optional(form, "vendorName"),
      project_id: identifier(form, "projectId"),
      client_id: identifier(form, "clientId"),
      submitted_by: identifier(form, "submittedBy"),
      approved_by: status === "Approved" ? identifier(form, "approvedBy") : null,
      amount,
      currency: text(form, "currency") || "ZAR",
      expense_date: expenseDate,
      status,
      receipt_reference: optional(form, "receiptReference"),
      notes: optional(form, "notes"),
      submitted_at: ["Submitted", "Awaiting Approval", "Approved", "Rejected"].includes(status)
        ? new Date().toISOString()
        : null,
      approved_at: status === "Approved" ? new Date().toISOString() : null,
    };
  } else {
    const name = text(form, "name");
    const periodLabel = text(form, "periodLabel");
    if (!name || !periodLabel) {
      return { error: "Scenario name and forecast period are required." };
    }
    table = "financial_forecasts";
    values = {
      organization_id: organization.id,
      name,
      period_label: periodLabel,
      period_start: optional(form, "periodStart"),
      period_end: optional(form, "periodEnd"),
      forecast_type: text(form, "forecastType") || "Revenue",
      actual_value: number(form, "actualValue"),
      projected_value: number(form, "projectedValue"),
      confidence_percent: Math.min(100, Math.max(0, number(form, "confidencePercent", 50))),
      currency: text(form, "currency") || "ZAR",
      status: text(form, "status") || "Draft",
      owner_id: identifier(form, "ownerId"),
      assumptions: optional(form, "assumptions"),
    };
  }

  const result = id && isUuid(id)
    ? await db
        .from(table)
        .update(values)
        .eq("id", id)
        .eq("organization_id", organization.id)
        .select("id")
        .maybeSingle()
    : await db.from(table).insert(values).select("id").single();

  if (result.error || !result.data) {
    const message = String(result.error?.message ?? "");
    const conversionRefused = message.includes("leads_converted_status_check") || message.includes("leads_conversion_guarded");
    // The update never sets the converted_* columns, so the conversion guard can only fire on a
    // status flip: submitting anything but Converted for a saved lead means it was Converted.
    const leavingConverted = kind === "lead" && Boolean(id && isUuid(id)) && values.status !== "Converted";
    return {
      error: documentErrorMessage(message)
        ?? (result.error?.code === "23505"
          ? "That reference or scenario name already exists."
          : conversionRefused && leavingConverted
            ? "A converted lead cannot be changed back to another status."
            : conversionRefused
              ? "A lead becomes Converted by using Convert lead on its page."
              : message.includes("sales_opportunities_lost_reason_check")
                ? "Say why this opportunity was lost."
                : "The record could not be saved. Check related records, dates and amounts."),
    };
  }

  const base = routes[kind];
  revalidatePath(base);
  redirect(`${base}/${result.data.id}`);
}
