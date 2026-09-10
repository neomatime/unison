import "server-only";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

export type FrameworkPhase = {
  id: string;
  name: string;
  position: number;
  archivedAt: string | null;
  /** Unarchived projects currently in this phase. */
  projectCount: number;
};

export type FrameworkProject = {
  id: string;
  name: string;
  status: string;
  health: string;
  phase: string | null;
};

export type FrameworkDetail = {
  id: string;
  name: string;
  type: string | null;
  version: string | null;
  archivedAt: string | null;
  level1Label: string | null;
  level2Label: string | null;
  /** Every phase, archived included, in stored order. */
  phases: FrameworkPhase[];
  projects: FrameworkProject[];
  gates: Array<{
    id: string;
    name: string;
    description: string | null;
    phaseName: string;
    approvalRequired: boolean;
    evidenceRequired: boolean;
  }>;
  versions: Array<{ id: string; version: string | null; createdAt: string }>;
};

/**
 * Org-scoped, so "belongs to another organisation" and "does not exist" both
 * arrive as null and both mean 404 — the same rule getProject follows.
 *
 * Archived frameworks ARE returned: the register hides them, but the detail
 * page is where one is unarchived, so it must be reachable by URL.
 */
export async function getFramework(
  frameworkId: string,
): Promise<FrameworkDetail | null> {
  // A malformed id is a miss, not a fault — see isUuid. The detail route
  // already guards this itself (with the fuller comment); guarding here too
  // means the edit route, and any future caller, inherits it for free.
  if (!isUuid(frameworkId)) return null;

  const { organization } = await getSessionContext();
  const supabase = await createServerSupabase();
  const governance = supabase as any;

  const { data: framework, error } = await supabase
    .from("frameworks")
    .select(
      "id, name, type, version, archived_at, level_1_label, level_2_label",
    )
    .eq("id", frameworkId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (error) throw error;
  if (!framework) return null;

  const [phases, projects, gates, versions] = await Promise.all([
    supabase
      .from("framework_phases")
      .select("id, name, position, archived_at")
      .eq("framework_id", frameworkId)
      .eq("organization_id", organization.id)
      .order("position", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name, status, health, phase_id, framework_phases(name)")
      .eq("framework_id", frameworkId)
      .eq("organization_id", organization.id)
      .is("archived_at", null)
      .order("name"),
    governance
      .from("governance_gates")
      .select(
        "id,name,description,approval_required,evidence_required,framework_phases(name)",
      )
      .eq("framework_id", frameworkId)
      .eq("organization_id", organization.id)
      .order("position"),
    governance
      .from("framework_versions")
      .select("id,version,created_at")
      .eq("framework_id", frameworkId)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
  ]);
  if (phases.error) throw phases.error;
  if (projects.error) throw projects.error;
  if (gates.error) throw gates.error;
  if (versions.error) throw versions.error;

  const projectsByPhase = new Map<string, number>();
  for (const row of projects.data ?? []) {
    if (!row.phase_id) continue;
    projectsByPhase.set(
      row.phase_id,
      (projectsByPhase.get(row.phase_id) ?? 0) + 1,
    );
  }

  return {
    id: framework.id,
    name: framework.name,
    type: framework.type,
    version: framework.version,
    archivedAt: framework.archived_at,
    level1Label: framework.level_1_label,
    level2Label: framework.level_2_label,
    phases: (phases.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      archivedAt: row.archived_at,
      projectCount: projectsByPhase.get(row.id) ?? 0,
    })),
    projects: (projects.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      health: row.health,
      phase: row.framework_phases?.name ?? null,
    })),
    gates: (gates.data ?? []).map((row: { id: string; name: string; description: string | null; framework_phases: { name: string } | null; approval_required: boolean; evidence_required: boolean }) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      phaseName: row.framework_phases?.name ?? "Unknown phase",
      approvalRequired: row.approval_required,
      evidenceRequired: row.evidence_required,
    })),
    versions: (versions.data ?? []).map((row: { id: string; version: string | null; created_at: string }) => ({
      id: row.id,
      version: row.version,
      createdAt: row.created_at,
    })),
  };
}
