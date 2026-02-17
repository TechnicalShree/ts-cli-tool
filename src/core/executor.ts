import path from "node:path";
import readline from "node:readline/promises";
import type { CommandContext, FixStep } from "../types.js";
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
  if (step.id.includes("node-modules")) return ["node_modules"];
  if (step.id.includes("lockfiles")) return ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"];
  if (step.id.includes("python-reset-venv")) return [".venv"];
  return [];
}

export async function executeSteps(ctx: CommandContext, steps: FixStep[], snapshotDir: string): Promise<FixStep[]> {
  const output: FixStep[] = [];

  for (const step of steps) {
    const current = { ...step };

    if (ctx.command === "doctor" || ctx.command === "plan" || ctx.flags.dryRun) {
      current.status = "planned";
      output.push(current);
      continue;
    }

    if (step.destructive && !canAutoRunDestructive(ctx)) {
      if (shouldPromptForDestructive(ctx, step)) {
        const ok = await askConfirmation(`Run destructive step: ${step.title}?`);
        if (!ok) {
          current.status = "proposed";
          current.proposedReason = "Needs explicit approval";
          output.push(current);
          continue;
        }
      } else {
        current.status = "proposed";
        current.proposedReason = ctx.interactive
          ? "Needs --deep or --approve"
          : "Non-interactive mode: destructive step skipped";
        output.push(current);
        continue;
      }
    }

    current.status = "running";

    if (step.destructive) {
      const snaps = await snapshotPathsForStep(ctx.cwd, path.join(snapshotDir, ctx.runId), step.id, snapshotCandidates(step));
      current.snapshotPaths = snaps;
    }

    let failed = false;
    const commandOutputs: string[] = [];
    for (const command of step.commands) {
      if (ctx.flags.verbose) {
        console.log(`  ▸ ${command}`);
      }
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

    current.output = commandOutputs.join("\n\n");
    if (failed) {
      current.status = "failed";
      current.error = "One or more commands failed";
    } else {
      current.status = "success";
    }

    output.push(current);
  }

  return output;
}
