import path from "node:path";
import readline from "node:readline/promises";
import { tmpdir } from "node:os";
import type { CommandContext, Config, EnvDetection, FixStep, RunReport } from "../types.js";
import type { StepHooks } from "../ui/renderer.js";
import { detectEnvironment } from "./detectEnvironment.js";
import { buildPlan } from "./planBuilder.js";
import { executeSteps } from "./executor.js";
import { ensureAutofixInGitignore, ensureWritableDir } from "../utils/fs.js";

export interface RunCallbacks {
  onDetection?(detection: EnvDetection): void;
  onPlanReady?(steps: FixStep[]): void;
  stepHooks?: StepHooks;
}

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

async function maybeConfirmPolyglot(ctx: CommandContext, detection: EnvDetection): Promise<boolean> {
  const count = [detection.node.detected, detection.python.detected, detection.docker.detected].filter(Boolean).length;
  if (ctx.flags.focus !== "all" || count < 2) return true;
  if (ctx.flags.approve) return true;
  if (!ctx.interactive) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Detected Node + Python + Docker scope. Run all subsystems? (Y/n): ")).trim().toLowerCase();
  rl.close();
  return !(answer === "n" || answer === "no");
}

function applyPolyglotGuard(ctx: CommandContext, detection: EnvDetection, steps: FixStep[]): { steps: FixStep[]; warnings: string[] } {
  const warnings: string[] = [];
  const count = [detection.node.detected, detection.python.detected, detection.docker.detected].filter(Boolean).length;
  if (count < 2 || ctx.flags.focus !== "all") return { steps, warnings };

  if (!ctx.interactive && !ctx.flags.approve) {
    warnings.push("Non-interactive polyglot run defaulted to safe minimal set (ports + caches only)");
    const filtered = steps.filter((s) => s.phase === "ports" || s.id.includes("clean-cache") || s.id.includes("next-cache") || s.id.includes("vite-cache"));
    return { steps: filtered, warnings };
  }

  if (!ctx.flags.approve) {
    const heavy = steps.filter((s) => s.phase === "docker" || s.id.includes("install-deps") || s.id.includes("reset-venv") || s.id.includes("remove-node-modules"));
    if (heavy.length > 2) warnings.push("Heavy polyglot plan detected. Use --approve for full deep multi-ecosystem cleanup.");
  }

  return { steps, warnings };
}

function computeSummary(steps: FixStep[], detection: EnvDetection, warnings: string[]) {
  const succeeded = steps.filter((s) => s.status === "success").length;
  const failed = steps.filter((s) => s.status === "failed" || s.status === "partial").length;
  const skipped = steps.filter((s) => s.status === "skipped" || s.status === "proposed" || s.status === "planned").length;
  const irreversibleStepIds = steps.filter((s) => s.irreversible && (s.status === "success" || s.status === "proposed" || s.status === "planned")).map((s) => s.id);

  return {
    detectedEnvironment: summarizeDetection(detection),
    actions: steps.map((s) => `${s.status}: ${s.title}`),
    succeeded,
    failed,
    skipped,
    nextBestAction: suggestNextAction(detection),
    undoCoverage: irreversibleStepIds.length > 0 ? ("partial" as const) : ("full" as const),
    irreversibleStepIds,
    warnings,
  };
}

export async function runAutoFix(
  ctx: CommandContext,
  config: Config,
  reportDir: string,
  callbacks?: RunCallbacks,
): Promise<{ report: RunReport; gitignoreUpdated: boolean }> {
  const detection = await detectEnvironment(ctx.cwd, config);
  callbacks?.onDetection?.(detection);

  const runAll = await maybeConfirmPolyglot(ctx, detection);
  if (!runAll) {
    ctx.flags.focus = "node";
  }

  const plan = await buildPlan(ctx.cwd, detection, config, ctx.flags);
  const guarded = applyPolyglotGuard(ctx, detection, plan);
  callbacks?.onPlanReady?.(guarded.steps);

  const desiredSnapshotDir = path.resolve(ctx.cwd, config.output.snapshot_dir);
  const writable = await ensureWritableDir(desiredSnapshotDir);
  const snapshotDir = writable ? desiredSnapshotDir : path.join(tmpdir(), "autofix", ctx.runId);
  if (!writable) await ensureWritableDir(snapshotDir);

  const executed = await executeSteps(ctx, guarded.steps, snapshotDir, callbacks?.stepHooks);
  const gitignoreUpdated = await ensureAutofixInGitignore(ctx.cwd);
  if (gitignoreUpdated) guarded.warnings.push("Added .autofix/ to .gitignore");
  if (!writable) guarded.warnings.push(`.autofix not writable; using temp snapshot dir: ${snapshotDir}`);

  if (detection.docker.detected && config.docker.safe_down && guarded.steps.some((s) => s.checkKind === "test")) {
    guarded.warnings.push("Tests may require services; run `docker compose up -d` and re-run tests.");
  }

  const report: RunReport = {
    runId: ctx.runId,
    command: ctx.command,
    cwd: ctx.cwd,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    flags: ctx.flags,
    detection,
    steps: executed,
    summary: computeSummary(executed, detection, guarded.warnings),
    undo: executed
      .filter((s) => s.snapshotPaths && s.snapshotPaths.length > 0)
      .map((s) => ({
        stepId: s.id,
        snapshotPaths: s.snapshotPaths ?? [],
        restored: [],
        skipped: [],
        missingSnapshot: [],
        failed: [],
        nextBestAction: s.undoHints?.[0]?.command,
      })),
    storage: {
      reportDir,
      snapshotDir,
      fallbackToTemp: !writable,
    },
  };

  return { report, gitignoreUpdated };
}
