import type { CliFlags, RunReport } from "../types.js";
import { style } from "../utils/colors.js";

function modeBanner(command: string, flags: CliFlags, useColor: boolean): string {
  const c = style(useColor);
  const tags: string[] = [];
  if (flags.dryRun && command !== "plan") tags.push("dry-run");
  if (flags.deep) tags.push("deep");
  if (flags.approve) tags.push("approve");
  if (flags.forceFresh) tags.push("force-fresh");
  if (flags.focus !== "all") tags.push(`focus:${flags.focus}`);
  if (flags.killPorts) tags.push("kill-ports");
  if (flags.verbose) tags.push("verbose");
  if (flags.quiet) tags.push("quiet");
  const tagStr = tags.length > 0 ? ` ${c.dim(`[${tags.join(", ")}]`)}` : "";
  return c.strong(`auto-fix · ${command}`) + tagStr;
}

export function renderSummary(report: RunReport, useColor: boolean): string {
  const c = style(useColor);
  const lines: string[] = [];

  lines.push(modeBanner(report.command, report.flags, useColor));
  lines.push("");

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
  lines.push(modeBanner(report.command, report.flags, useColor));
  lines.push("");
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
