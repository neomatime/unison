"use client";
import { useActionState } from "react";
import Link from "next/link";
import { WorkspaceHeader } from "@/components/shared/workspace-header";
import {
  savePortfolioAction,
  saveProgrammeAction,
} from "../actions/portfolio-management";
import type {
  PortfolioRecord,
  ProgrammeRecord,
} from "../queries/portfolio-management";
const field =
  "mt-1.5 h-11 w-full border border-border bg-background px-3 text-sm";
export function PortfolioForm({
  kind = "portfolio",
  portfolio,
  programme,
  portfolioId,
}: {
  kind?: "portfolio" | "programme";
  portfolio?: PortfolioRecord | null;
  programme?: ProgrammeRecord | null;
  portfolioId?: string;
}) {
  const action =
    kind === "portfolio"
      ? savePortfolioAction.bind(null, portfolio?.id)
      : saveProgrammeAction.bind(null, portfolioId!, programme?.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const item = kind === "portfolio" ? portfolio : programme;
  const singular = kind === "portfolio" ? "Portfolio" : "Programme";
  const back =
    kind === "portfolio"
      ? "/delivery/portfolio"
      : `/delivery/portfolio/${portfolioId}`;
  return (
    <>
      <WorkspaceHeader
        category="Delivery"
        parent={{
          label: kind === "portfolio" ? "Portfolio" : "Portfolio detail",
          href: back,
        }}
        title={`${item ? "Edit" : "New"} ${singular}`}
        description={`Define persistent ${singular.toLowerCase()} ownership, timing and executive context.`}
      />
      <form
        action={formAction}
        className="mx-auto max-w-4xl border border-border bg-card p-6"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field name="name" label="Name" required value={item?.name} />
          <Field name="code" label="Code" required value={item?.code} />
          <label className="md:col-span-2">
            Description
            <textarea
              name="description"
              defaultValue={item?.description ?? ""}
              rows={4}
              className={`${field} h-auto py-3`}
            />
          </label>
          {kind === "portfolio" ? (
            <>
              <Field
                name="businessUnit"
                label="Business unit"
                value={portfolio?.businessUnit}
              />
              <Field
                name="objective"
                label="Strategic objective"
                value={portfolio?.objective}
              />
              <Select
                name="status"
                label="Status"
                value={portfolio?.status}
                options={[
                  "Planning",
                  "Active",
                  "Under Review",
                  "On Hold",
                  "Complete",
                ]}
              />
            </>
          ) : (
            <>
              <Select
                name="status"
                label="Status"
                value={programme?.status}
                options={["Planning", "In Delivery", "On Hold", "Complete"]}
              />
              <Select
                name="health"
                label="Health"
                value={programme?.health}
                options={["Healthy", "Watch", "At Risk", "Critical"]}
              />
            </>
          )}
          <Field
            name="startDate"
            label="Start date"
            type="date"
            value={item?.startDate}
          />
          <Field
            name="targetEndDate"
            label="Target end date"
            type="date"
            value={item?.targetEndDate}
          />
        </div>
        {state?.error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <footer className="mt-6 flex justify-end gap-2">
          <Link href={back} className="border border-border px-4 py-2 text-sm">
            Cancel
          </Link>
          <button
            disabled={pending}
            className="bg-brand px-5 py-2 text-sm font-semibold text-white"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </>
  );
}
function Field({
  name,
  label,
  value,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  value?: string | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={value ?? ""}
        className={field}
      />
    </label>
  );
}
function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: string[];
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value ?? options[0]} className={field}>
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}
