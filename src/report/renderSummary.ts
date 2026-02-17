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
      lines.push(`- [${step.status}] ${step.title}`);
    }
  }

  lines.push(c.title("Results"));
  lines.push(
    `- Success: ${report.summary.succeeded}, Failed: ${report.summary.failed}, Skipped/Proposed: ${report.summary.skipped}`,
  );

  lines.push(c.title("Next best action"));
  lines.push(`- ${report.summary.nextBestAction}`);

  return lines.join("\n");
}
