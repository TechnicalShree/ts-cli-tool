import path from "node:path";
import type { CommandContext, Config, EnvDetection, FixStep, RunReport } from "../types.js";
import { detectEnvironment } from "./detectEnvironment.js";
import { buildPlan } from "./planBuilder.js";
import { executeSteps } from "./executor.js";

function suggestNextAction(detection: EnvDetection): string {
  if (detection.node.detected) return "npm run dev";
  if (detection.python.detected) return "python -m pytest -q";
  if (detection.docker.detected) return "docker compose ps";
  return "Review project setup and rerun auto-fix doctor";
}

function summarizeDetection(detection: EnvDetection): string[] {
  const out: string[] = [];
  if (detection.node.detected) out.push("Node");
  if (detection.python.detected) out.push("Python");
  if (detection.docker.detected) out.push("Docker Compose");
  if (out.length === 0) out.push("No supported project type detected");
  return out;
}

function computeSummary(steps: FixStep[], detection: EnvDetection) {
  const succeeded = steps.filter((s) => s.status === "success").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const skipped = steps.filter((s) => s.status === "skipped" || s.status === "proposed" || s.status === "planned").length;
  return {
    detectedEnvironment: summarizeDetection(detection),
    actions: steps.map((s) => `${s.status}: ${s.title}`),
    succeeded,
    failed,
    skipped,
    nextBestAction: suggestNextAction(detection),
  };
}

export async function runAutoFix(ctx: CommandContext, config: Config): Promise<RunReport> {
  const detection = await detectEnvironment(ctx.cwd, config);
  const plannedSteps = buildPlan(detection, config, ctx.flags);
  const executed = await executeSteps(ctx, plannedSteps, path.resolve(ctx.cwd, config.output.snapshot_dir));

  const report: RunReport = {
    runId: ctx.runId,
    command: ctx.command,
    cwd: ctx.cwd,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    flags: ctx.flags,
    detection,
    steps: executed,
    summary: computeSummary(executed, detection),
    undo: executed
      .filter((s) => s.snapshotPaths && s.snapshotPaths.length > 0)
      .map((s) => ({
        stepId: s.id,
        snapshotPaths: s.snapshotPaths ?? [],
        restored: [],
        failed: [],
      })),
  };

  return report;
}
