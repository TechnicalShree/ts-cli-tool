import path from "node:path";
import readline from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import type { CommandContext, FixStep } from "../types.js";
import type { StepHooks } from "../ui/renderer.js";
import { runShellCommand } from "../utils/process.js";
import { canAutoRunDestructive, shouldPromptForDestructive } from "./safety.js";
import { snapshotPathsForStep } from "./snapshots.js";

async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N]: `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

function snapshotCandidates(step: FixStep): string[] {
  if (step.id.includes("lockfiles")) return ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"];
  return [];
}

async function verifyPortsReleased(cwd: string, commands: string[]): Promise<{ ok: boolean; details: string }> {
  const ports = commands
    .map((c) => c.match(/:(\d+)/)?.[1])
    .filter((v): v is string => Boolean(v));

  const maxMs = 2000;
  const intervalMs = 100;
  let elapsed = 0;

  while (elapsed <= maxMs) {
    const checks = await Promise.all(ports.map((p) => runShellCommand(`lsof -ti :${p}`, cwd)));
    const busy = checks
      .map((result, idx) => ({ port: ports[idx], pids: result.stdout.trim().split(/\s+/).filter(Boolean) }))
      .filter((x) => x.pids.length > 0);

    if (busy.length === 0) {
      await sleep(150);
      return { ok: true, details: "ports confirmed free" };
    }
    await sleep(intervalMs);
    elapsed += intervalMs;
  }

  const remaining = await Promise.all(ports.map((p) => runShellCommand(`lsof -ti :${p}`, cwd)));
  const detail = remaining
    .map((r, i) => `${ports[i]}: ${r.stdout.trim() || "none"}`)
    .join(", ");
  return { ok: false, details: `remaining pid(s) -> ${detail}. Try: lsof -ti :<port> | xargs kill -9` };
}

export async function executeSteps(
  ctx: CommandContext,
  steps: FixStep[],
  snapshotDir: string,
  hooks?: StepHooks,
): Promise<FixStep[]> {
  const output: FixStep[] = [];
  const confirmFn = hooks?.onConfirm ?? askConfirmation;

  for (const step of steps) {
    const current = { ...step };

    if (ctx.flags.verbose) console.log(`[phase:${step.phase}] ${step.title}`);

    if (ctx.command === "doctor" || ctx.command === "plan" || ctx.flags.dryRun) {
      current.status = step.status === "proposed" ? "proposed" : "planned";
      output.push(current);
      continue;
    }

    if (step.destructive && !canAutoRunDestructive(ctx)) {
      if (shouldPromptForDestructive(ctx, step)) {
        const ok = await confirmFn(`Run destructive step: ${step.title}?`);
        if (!ok) {
          current.status = "proposed";
          current.proposedReason = "Needs explicit approval";
          hooks?.onStepEnd(current);
          output.push(current);
          continue;
        }
      } else {
        current.status = "proposed";
        current.proposedReason = ctx.interactive
          ? "Needs --deep or --approve"
          : "Non-interactive mode: destructive step skipped";
        hooks?.onStepEnd(current);
        output.push(current);
        continue;
      }
    }

    current.status = "running";
    hooks?.onStepStart(current);

    if (step.destructive || (step.snapshotPaths && step.snapshotPaths.length > 0)) {
      const candidates = step.destructive ? snapshotCandidates(step) : step.snapshotPaths ?? [];
      const snaps = await snapshotPathsForStep(ctx.cwd, path.join(snapshotDir, ctx.runId), step.id, candidates);
      current.snapshotPaths = snaps;
    }

    let failed = false;
    const commandOutputs: string[] = [];
    for (const command of step.commands) {
      if (ctx.flags.verbose) console.log(`  \u25B8 ${command}`);
      const result = await runShellCommand(command, ctx.cwd);
      commandOutputs.push(`$ ${command}\n${result.stdout}${result.stderr}`.trim());
      if (ctx.flags.verbose) {
        if (result.stdout) console.log(result.stdout.trimEnd());
        if (result.stderr) console.error(result.stderr.trimEnd());
      }
      if (!result.success) {
        failed = true;
        break;
      }
    }

    if (!failed && step.id === "ports-cleanup") {
      const portCheck = await verifyPortsReleased(ctx.cwd, step.commands);
      if (!portCheck.ok) {
        current.status = "failed";
        current.error = portCheck.details;
        current.output = commandOutputs.join("\n\n");
        hooks?.onStepEnd(current);
        output.push(current);
        continue;
      }
      commandOutputs.push(portCheck.details);
    }

    current.output = commandOutputs.join("\n\n");
    if (failed) {
      current.status = "failed";
      const combinedOutput = commandOutputs.join(" ");
      if (/EPERM|EBUSY|EACCES/.test(combinedOutput) && (step.subsystem === "node" || step.phase === "node")) {
        current.error = "Permission/lock error (EPERM/EBUSY). Close your IDE, dev servers, or file watchers and retry.";
      } else {
        current.error = "One or more commands failed";
      }
    } else {
      current.status = "success";
    }

    hooks?.onStepEnd(current);
    output.push(current);
  }

  return output;
}
