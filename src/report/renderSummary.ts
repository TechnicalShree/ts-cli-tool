import type { RunReport } from "../types.js";
import { style } from "../utils/colors.js";

export function renderSummary(report: RunReport, useColor: boolean): string {
  const c = style(useColor);
  const lines: string[] = [];

  lines.push(c.title("Detected environment"));
  lines.push(`- ${report.summary.detectedEnvironment.join(", ") || "None"}`);

  lines.push(c.title("Plan/Actions"));
  if (report.steps.length === 0) {
    lines.push("- No actions were planned.");
  } else {
    for (const step of report.steps) {
      const tags: string[] = [];
      if (step.irreversible) tags.push("IRREVERSIBLE");
      const extra = step.proposedReason ? ` (${step.proposedReason})` : "";
      lines.push(`- [${step.status}] ${step.id} ${step.title}${tags.length ? ` [${tags.join(",")}]` : ""}${extra}`);
      if (step.irreversible && step.irreversibleReason) {
        lines.push(`  reason: ${step.irreversibleReason} | This will NOT be covered by undo.`);
      }
    }
  }

  lines.push(c.title("Results"));
  lines.push(
    `- Success: ${report.summary.succeeded}, Failed: ${report.summary.failed}, Skipped/Proposed: ${report.summary.skipped}`,
  );

  if (report.summary.irreversibleStepIds.length > 0) {
    lines.push(`- Undo coverage: partial (some actions irreversible)`);
    lines.push(`- Irreversible steps: ${report.summary.irreversibleStepIds.join(", ")}`);
  }

  for (const warning of report.summary.warnings) {
    lines.push(`- Warning: ${warning}`);
  }

  lines.push(c.title("Next best action"));
  lines.push(`- ${report.summary.nextBestAction}`);

  return lines.join("\n");
}

export function renderQuietSummary(report: RunReport, useColor: boolean): string {
  const c = style(useColor);
  const lines: string[] = [];
  lines.push(c.title("Results"));
  lines.push(
    `- Success: ${report.summary.succeeded}, Failed: ${report.summary.failed}, Skipped/Proposed: ${report.summary.skipped}`,
  );
  if (report.summary.irreversibleStepIds.length > 0) {
    lines.push(`- Undo coverage: partial (some actions irreversible)`);
  }
  lines.push(c.title("Next best action"));
  lines.push(`- ${report.summary.nextBestAction}`);
  return lines.join("\n");
}
