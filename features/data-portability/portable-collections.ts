export const portableCollectionIds = [
  "clients",
  "frameworks",
  "projects",
  "portfolios",
  "programmes",
  "approvals",
  "team-members",
  "project-assignments",
  "client-onboardings",
  "vendors",
  "tasks",
  "calendar-events",
  "leads",
  "sales-opportunities",
  "quotes",
  "invoices",
  "expenses",
  "financial-forecasts",
  "documents",
  "support-tickets",
] as const;

export type PortableCollection = (typeof portableCollectionIds)[number];
export type PortableValueKind = "text" | "number" | "integer" | "boolean" | "date" | "datetime" | "uuid";

export type PortableColumn = {
  key: string;
  label: string;
  kind?: PortableValueKind;
  required?: boolean;
};

export type PortableDefinition = {
  id: PortableCollection;
  label: string;
  table: string;
  columns: PortableColumn[];
  importColumns?: PortableColumn[];
  orderBy: string;
};

const column = (key: string, label: string, kind: PortableValueKind = "text", required = false): PortableColumn => ({ key, label, kind, required });

export const portableDefinitions: Record<PortableCollection, PortableDefinition> = {
  clients: {
    id: "clients", label: "Clients", table: "clients", orderBy: "updated_at",
    columns: [column("name", "Name"), column("industry", "Industry"), column("website", "Website"), column("contact_name", "Contact Name"), column("contact_email", "Contact Email"), column("contact_phone", "Contact Phone"), column("service", "Service"), column("billing_email", "Billing Email"), column("status", "Status"), column("health", "Health"), column("created_at", "Created At", "datetime"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("name", "Name", "text", true), column("industry", "Industry"), column("website", "Website"), column("contact_name", "Contact Name"), column("contact_email", "Contact Email"), column("contact_phone", "Contact Phone"), column("service", "Service"), column("billing_email", "Billing Email"), column("notes", "Notes"), column("status", "Status"), column("health", "Health")],
  },
  frameworks: {
    id: "frameworks", label: "Frameworks", table: "frameworks", orderBy: "updated_at",
    columns: [column("name", "Name"), column("type", "Type"), column("version", "Version"), column("approval_status", "Approval Status"), column("progression_mode", "Progression Mode"), column("created_at", "Created At", "datetime"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("name", "Name", "text", true), column("type", "Type"), column("version", "Version"), column("approval_status", "Approval Status"), column("progression_mode", "Progression Mode")],
  },
  projects: {
    id: "projects", label: "Projects", table: "projects", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("name", "Name"), column("framework_id", "Framework ID", "uuid"), column("client_id", "Client ID", "uuid"), column("status", "Status"), column("health", "Health"), column("progress", "Progress", "integer"), column("next_gate", "Next Gate"), column("due_date", "Due Date", "date"), column("created_at", "Created At", "datetime"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("name", "Name", "text", true), column("framework_id", "Framework ID", "uuid", true), column("client_id", "Client ID", "uuid"), column("status", "Status"), column("health", "Health"), column("progress", "Progress", "integer"), column("next_gate", "Next Gate"), column("due_date", "Due Date", "date"), column("notes", "Notes")],
  },
  portfolios: {
    id: "portfolios", label: "Portfolios", table: "portfolios", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("name", "Name"), column("code", "Code"), column("description", "Description"), column("business_unit", "Business Unit"), column("strategic_objective", "Strategic Objective"), column("status", "Status"), column("start_date", "Start Date", "date"), column("target_end_date", "Target End Date", "date"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("name", "Name", "text", true), column("code", "Code", "text", true), column("description", "Description"), column("business_unit", "Business Unit"), column("strategic_objective", "Strategic Objective"), column("status", "Status"), column("start_date", "Start Date", "date"), column("target_end_date", "Target End Date", "date")],
  },
  programmes: {
    id: "programmes", label: "Programmes", table: "programmes", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("portfolio_id", "Portfolio ID", "uuid"), column("name", "Name"), column("code", "Code"), column("description", "Description"), column("status", "Status"), column("health", "Health"), column("start_date", "Start Date", "date"), column("target_end_date", "Target End Date", "date"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("portfolio_id", "Portfolio ID", "uuid", true), column("name", "Name", "text", true), column("code", "Code", "text", true), column("description", "Description"), column("status", "Status"), column("health", "Health"), column("start_date", "Start Date", "date"), column("target_end_date", "Target End Date", "date")],
  },
  approvals: {
    id: "approvals", label: "Approvals", table: "approvals", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("project_id", "Project ID", "uuid"), column("framework_id", "Framework ID", "uuid"), column("title", "Title"), column("description", "Description"), column("status", "Status"), column("priority", "Priority"), column("due_date", "Due Date", "date"), column("submitted_at", "Submitted At", "datetime"), column("decided_at", "Decided At", "datetime"), column("updated_at", "Updated At", "datetime")],
  },
  "team-members": {
    id: "team-members", label: "Team Members", table: "team_members", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("full_name", "Full Name"), column("email", "Email"), column("job_title", "Job Title"), column("delivery_role", "Delivery Role"), column("department", "Department"), column("team_name", "Team"), column("capacity_percent", "Capacity", "integer"), column("availability", "Availability"), column("status", "Status"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("full_name", "Full Name", "text", true), column("email", "Email", "text", true), column("job_title", "Job Title"), column("delivery_role", "Delivery Role"), column("department", "Department"), column("team_name", "Team"), column("capacity_percent", "Capacity", "integer"), column("availability", "Availability"), column("availability_note", "Availability Note"), column("status", "Status"), column("access_role", "Access Role"), column("joined_on", "Joined On", "date")],
  },
  "project-assignments": {
    id: "project-assignments", label: "Project Assignments", table: "project_assignments", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("project_id", "Project ID", "uuid"), column("team_member_id", "Team Member ID", "uuid"), column("delivery_role", "Delivery Role"), column("allocation_percent", "Allocation", "integer"), column("start_date", "Start Date", "date"), column("end_date", "End Date", "date"), column("status", "Status"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("project_id", "Project ID", "uuid", true), column("team_member_id", "Team Member ID", "uuid", true), column("delivery_role", "Delivery Role", "text", true), column("allocation_percent", "Allocation", "integer"), column("start_date", "Start Date", "date", true), column("end_date", "End Date", "date"), column("status", "Status"), column("notes", "Notes")],
  },
  "client-onboardings": {
    id: "client-onboardings", label: "Client Onboardings", table: "client_onboardings", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("client_name", "Client Name"), column("client_id", "Client ID", "uuid"), column("onboarding_type", "Onboarding Type"), column("stage", "Stage"), column("progress_percent", "Progress", "integer"), column("health", "Health"), column("priority", "Priority"), column("target_go_live", "Target Go Live", "date"), column("status", "Status"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("client_name", "Client Name", "text", true), column("client_id", "Client ID", "uuid"), column("owner_id", "Owner ID", "uuid"), column("onboarding_type", "Onboarding Type"), column("stage", "Stage"), column("progress_percent", "Progress", "integer"), column("health", "Health"), column("priority", "Priority"), column("start_date", "Start Date", "date"), column("target_go_live", "Target Go Live", "date"), column("required_documents", "Required Documents", "integer"), column("notes", "Notes"), column("status", "Status")],
  },
  vendors: {
    id: "vendors", label: "Vendors", table: "vendors", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("name", "Name"), column("vendor_type", "Vendor Type"), column("service_category", "Service Category"), column("region", "Region"), column("primary_contact", "Primary Contact"), column("contact_email", "Contact Email"), column("contract_end", "Contract End", "date"), column("contract_value", "Contract Value", "number"), column("sla_percent", "SLA", "number"), column("risk_level", "Risk Level"), column("compliance_status", "Compliance Status"), column("status", "Status"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("name", "Name", "text", true), column("vendor_type", "Vendor Type"), column("service_category", "Service Category"), column("region", "Region"), column("owner_id", "Owner ID", "uuid"), column("primary_contact", "Primary Contact"), column("contact_email", "Contact Email"), column("phone", "Phone"), column("contract_start", "Contract Start", "date"), column("contract_end", "Contract End", "date"), column("contract_value", "Contract Value", "number"), column("renewal_notice_days", "Renewal Notice Days", "integer"), column("sla_percent", "SLA", "number"), column("data_sensitivity", "Data Sensitivity"), column("risk_level", "Risk Level"), column("compliance_status", "Compliance Status"), column("status", "Status"), column("notes", "Notes")],
  },
  tasks: {
    id: "tasks", label: "Tasks", table: "tasks", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("title", "Title"), column("description", "Description"), column("project_id", "Project ID", "uuid"), column("client_id", "Client ID", "uuid"), column("priority", "Priority"), column("status", "Status"), column("due_at", "Due At", "datetime"), column("completed_at", "Completed At", "datetime"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("title", "Title", "text", true), column("description", "Description"), column("project_id", "Project ID", "uuid"), column("client_id", "Client ID", "uuid"), column("onboarding_id", "Onboarding ID", "uuid"), column("assignee_id", "Assignee ID", "uuid"), column("priority", "Priority"), column("status", "Status"), column("due_at", "Due At", "datetime")],
  },
  "calendar-events": {
    id: "calendar-events", label: "Calendar Events", table: "calendar_events", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("title", "Title"), column("description", "Description"), column("event_type", "Event Type"), column("start_at", "Start At", "datetime"), column("end_at", "End At", "datetime"), column("all_day", "All Day", "boolean"), column("location", "Location"), column("status", "Status"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("title", "Title", "text", true), column("description", "Description"), column("event_type", "Event Type"), column("start_at", "Start At", "datetime", true), column("end_at", "End At", "datetime", true), column("all_day", "All Day", "boolean"), column("location", "Location"), column("owner_id", "Owner ID", "uuid"), column("project_id", "Project ID", "uuid"), column("client_id", "Client ID", "uuid"), column("onboarding_id", "Onboarding ID", "uuid"), column("status", "Status")],
  },
  leads: {
    id: "leads", label: "Leads", table: "leads", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("company_name", "Company Name"), column("contact_name", "Contact Name"), column("contact_email", "Contact Email"), column("contact_phone", "Contact Phone"), column("source", "Source"), column("estimated_value", "Estimated Value", "number"), column("currency", "Currency"), column("status", "Status"), column("last_activity_at", "Last Activity", "datetime"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("company_name", "Company Name", "text", true), column("contact_name", "Contact Name", "text", true), column("contact_email", "Contact Email"), column("contact_phone", "Contact Phone"), column("source", "Source"), column("owner_id", "Owner ID", "uuid"), column("estimated_value", "Estimated Value", "number"), column("currency", "Currency"), column("status", "Status"), column("last_activity_at", "Last Activity", "datetime"), column("notes", "Notes")],
  },
  "sales-opportunities": {
    id: "sales-opportunities", label: "Sales Opportunities", table: "sales_opportunities", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("name", "Name"), column("client_name", "Client Name"), column("stage", "Stage"), column("expected_value", "Expected Value", "number"), column("currency", "Currency"), column("probability_percent", "Probability", "integer"), column("expected_close", "Expected Close", "date"), column("next_step", "Next Step"), column("won_at", "Won At", "datetime"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("name", "Name", "text", true), column("client_name", "Client Name", "text", true), column("client_id", "Client ID", "uuid"), column("lead_id", "Lead ID", "uuid"), column("owner_id", "Owner ID", "uuid"), column("stage", "Stage"), column("expected_value", "Expected Value", "number"), column("currency", "Currency"), column("probability_percent", "Probability", "integer"), column("expected_close", "Expected Close", "date"), column("next_step", "Next Step"), column("lost_reason", "Lost Reason"), column("notes", "Notes")],
  },
  quotes: {
    id: "quotes", label: "Quotes", table: "quotes", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("quote_number", "Quote Number"), column("client_name", "Client Name"), column("contact_name", "Contact Name"), column("valid_until", "Valid Until", "date"), column("subtotal", "Subtotal", "number"), column("tax_amount", "Tax Amount", "number"), column("total_amount", "Total Amount", "number"), column("currency", "Currency"), column("status", "Status"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("quote_number", "Quote Number", "text", true), column("client_name", "Client Name", "text", true), column("client_id", "Client ID", "uuid"), column("contact_name", "Contact Name"), column("lead_id", "Lead ID", "uuid"), column("opportunity_id", "Opportunity ID", "uuid"), column("owner_id", "Owner ID", "uuid"), column("valid_until", "Valid Until", "date"), column("subtotal", "Subtotal", "number"), column("tax_amount", "Tax Amount", "number"), column("total_amount", "Total Amount", "number"), column("currency", "Currency"), column("status", "Status"), column("terms", "Terms"), column("notes", "Notes")],
  },
  invoices: {
    id: "invoices", label: "Invoices", table: "invoices", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("invoice_number", "Invoice Number"), column("client_name", "Client Name"), column("issue_date", "Issue Date", "date"), column("due_date", "Due Date", "date"), column("subtotal", "Subtotal", "number"), column("tax_amount", "Tax Amount", "number"), column("total_amount", "Total Amount", "number"), column("balance_amount", "Balance Amount", "number"), column("currency", "Currency"), column("status", "Status"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("invoice_number", "Invoice Number", "text", true), column("client_name", "Client Name", "text", true), column("client_id", "Client ID", "uuid"), column("project_id", "Project ID", "uuid"), column("quote_id", "Quote ID", "uuid"), column("opportunity_id", "Opportunity ID", "uuid"), column("owner_id", "Owner ID", "uuid"), column("issue_date", "Issue Date", "date"), column("due_date", "Due Date", "date"), column("subtotal", "Subtotal", "number"), column("tax_amount", "Tax Amount", "number"), column("total_amount", "Total Amount", "number"), column("balance_amount", "Balance Amount", "number"), column("currency", "Currency"), column("status", "Status"), column("payment_terms", "Payment Terms"), column("notes", "Notes")],
  },
  expenses: {
    id: "expenses", label: "Expenses", table: "expenses", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("description", "Description"), column("category", "Category"), column("vendor_name", "Vendor Name"), column("amount", "Amount", "number"), column("currency", "Currency"), column("expense_date", "Expense Date", "date"), column("status", "Status"), column("receipt_reference", "Receipt Reference"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("description", "Description", "text", true), column("category", "Category"), column("vendor_id", "Vendor ID", "uuid"), column("vendor_name", "Vendor Name"), column("project_id", "Project ID", "uuid"), column("client_id", "Client ID", "uuid"), column("submitted_by", "Submitted By ID", "uuid"), column("approved_by", "Approved By ID", "uuid"), column("amount", "Amount", "number", true), column("currency", "Currency"), column("expense_date", "Expense Date", "date", true), column("status", "Status"), column("receipt_reference", "Receipt Reference"), column("notes", "Notes")],
  },
  "financial-forecasts": {
    id: "financial-forecasts", label: "Financial Forecasts", table: "financial_forecasts", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("name", "Name"), column("period_label", "Period"), column("period_start", "Period Start", "date"), column("period_end", "Period End", "date"), column("forecast_type", "Forecast Type"), column("actual_value", "Actual Value", "number"), column("projected_value", "Projected Value", "number"), column("confidence_percent", "Confidence", "integer"), column("currency", "Currency"), column("status", "Status"), column("updated_at", "Updated At", "datetime")],
    importColumns: [column("name", "Name", "text", true), column("period_label", "Period", "text", true), column("period_start", "Period Start", "date"), column("period_end", "Period End", "date"), column("forecast_type", "Forecast Type"), column("actual_value", "Actual Value", "number"), column("projected_value", "Projected Value", "number"), column("confidence_percent", "Confidence", "integer"), column("currency", "Currency"), column("status", "Status"), column("owner_id", "Owner ID", "uuid"), column("assumptions", "Assumptions")],
  },
  documents: {
    id: "documents", label: "Documents", table: "documents", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("display_name", "Name"), column("mime_type", "MIME Type"), column("file_size", "File Size", "integer"), column("classification", "Classification"), column("confidentiality", "Confidentiality"), column("linked_record_type", "Linked Record Type"), column("linked_record_id", "Linked Record ID", "uuid"), column("version", "Version", "integer"), column("created_at", "Uploaded At", "datetime"), column("updated_at", "Updated At", "datetime")],
  },
  "support-tickets": {
    id: "support-tickets", label: "Support Tickets", table: "support_tickets", orderBy: "updated_at",
    columns: [column("id", "ID", "uuid"), column("ticket_number", "Ticket Number", "integer"), column("subject", "Subject"), column("category", "Category"), column("priority", "Priority"), column("description", "Description"), column("status", "Status"), column("resolution", "Resolution"), column("created_at", "Created At", "datetime"), column("updated_at", "Updated At", "datetime")],
  },
};

export function isPortableCollection(value: string | null): value is PortableCollection {
  return Boolean(value && (portableCollectionIds as readonly string[]).includes(value));
}
