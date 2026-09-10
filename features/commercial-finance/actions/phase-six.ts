"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import type { PhaseSixKind } from "../queries/phase-six";

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
    const quoteNumber = text(form, "quoteNumber");
    const resolvedClient = await clientName(db, organization.id, form);
    if (resolvedClient.invalid) return { error: "The selected client could not be verified." };
    if (!quoteNumber || !resolvedClient.name) {
      return { error: "Quote number and client or prospect are required." };
    }
    const subtotal = Math.max(0, number(form, "subtotal"));
    const taxAmount = Math.max(0, number(form, "taxAmount"));
    const totalAmount = Math.max(0, number(form, "totalAmount", subtotal + taxAmount));
    const status = text(form, "status") || "Draft";
    table = "quotes";
    values = {
      organization_id: organization.id,
      quote_number: quoteNumber,
      client_id: resolvedClient.clientId,
      client_name: resolvedClient.name,
      contact_name: optional(form, "contactName"),
      lead_id: identifier(form, "leadId"),
      opportunity_id: identifier(form, "opportunityId"),
      owner_id: identifier(form, "ownerId"),
      valid_until: optional(form, "validUntil"),
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      currency: text(form, "currency") || "ZAR",
      status,
      sent_at: status === "Sent" ? new Date().toISOString() : null,
      accepted_at: status === "Accepted" ? new Date().toISOString() : null,
      terms: optional(form, "terms"),
      notes: optional(form, "notes"),
    };
  } else if (kind === "invoice") {
    const invoiceNumber = text(form, "invoiceNumber");
    const resolvedClient = await clientName(db, organization.id, form);
    if (resolvedClient.invalid) return { error: "The selected client could not be verified." };
    if (!invoiceNumber || !resolvedClient.name) {
      return { error: "Invoice number and client are required." };
    }
    const subtotal = Math.max(0, number(form, "subtotal"));
    const taxAmount = Math.max(0, number(form, "taxAmount"));
    const totalAmount = Math.max(0, number(form, "totalAmount", subtotal + taxAmount));
    const status = text(form, "status") || "Draft";
    const balanceAmount = status === "Paid"
      ? 0
      : Math.min(totalAmount, Math.max(0, number(form, "balanceAmount", totalAmount)));
    table = "invoices";
    values = {
      organization_id: organization.id,
      invoice_number: invoiceNumber,
      client_id: resolvedClient.clientId,
      client_name: resolvedClient.name,
      project_id: identifier(form, "projectId"),
      quote_id: identifier(form, "quoteId"),
      opportunity_id: identifier(form, "opportunityId"),
      owner_id: identifier(form, "ownerId"),
      issue_date: optional(form, "issueDate"),
      due_date: optional(form, "dueDate"),
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      balance_amount: balanceAmount,
      currency: text(form, "currency") || "ZAR",
      status,
      paid_at: status === "Paid" ? new Date().toISOString() : null,
      payment_terms: optional(form, "paymentTerms"),
      notes: optional(form, "notes"),
    };
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
    return {
      error: result.error?.code === "23505"
        ? "That reference or scenario name already exists."
        : "The record could not be saved. Check related records, dates and amounts.",
    };
  }

  const base = routes[kind];
  revalidatePath(base);
  redirect(`${base}/${result.data.id}`);
}
