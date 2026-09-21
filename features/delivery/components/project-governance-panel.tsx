"use client";

import { useState } from "react";
import type { SelectableMember } from "../form-options";
import type { getProjectGovernance } from "../queries/get-project-governance";
import { ProjectApprovalsRegister } from "./project-approvals-register";
import { ProjectDecisionsRegister } from "./project-decisions-register";
import { ProjectEvidenceRegister } from "./project-evidence-register";
import { ProjectRisksRegister } from "./project-risks-register";

type Governance = Awaited<ReturnType<typeof getProjectGovernance>>;
const tabs = ["Gates & approvals", "Risks", "Decisions", "Evidence"] as const;

export function ProjectGovernancePanel({
  projectId,
  governance,
  members,
}: {
  projectId: string;
  governance: Governance;
  members: SelectableMember[];
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Gates & approvals");
  return (
    <div>
      <nav
        className="mb-5 flex gap-1 overflow-x-auto border-b border-border"
        aria-label="Project governance tabs"
      >
        {tabs.map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setTab(item)}
            aria-selected={tab === item}
            className={`unison-action-control whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 ${tab === item ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {item}
          </button>
        ))}
      </nav>
      {tab === "Gates & approvals" ? (
        <ProjectApprovalsRegister
          projectId={projectId}
          approvals={governance.approvals}
        />
      ) : tab === "Risks" ? (
        <ProjectRisksRegister
          projectId={projectId}
          risks={governance.risks}
          members={members}
        />
      ) : tab === "Decisions" ? (
        <ProjectDecisionsRegister
          projectId={projectId}
          decisions={governance.decisions}
        />
      ) : (
        <ProjectEvidenceRegister
          projectId={projectId}
          artefacts={governance.artefacts}
        />
      )}
    </div>
  );
}
