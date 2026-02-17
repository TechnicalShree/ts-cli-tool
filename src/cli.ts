#!/usr/bin/env node

import path from "node:path";
import { randomBytes } from "node:crypto";
import { loadConfig } from "./config/loadConfig.js";
import { runAutoFix } from "./core/run.js";
import { renderSummary, renderQuietSummary } from "./report/renderSummary.js";
import { writeRunReport } from "./report/writeReport.js";
import { isInteractive } from "./utils/tty.js";
import type { CliFlags, CommandContext } from "./types.js";
import { readJsonFile } from "./utils/fs.js";
import { undoLatest } from "./core/undo.js";
import { createRenderer } from "./ui/renderer.js";

function makeRunId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function printHelp(): void {
  console.log(`
auto-fix — detect, diagnose, and safely fix common dev environment issues

USAGE
  auto-fix [command] [flags]

COMMANDS
  (default)    Run safe fixes (detect project, execute fix plan)
  doctor       Diagnosis only — no changes, collects facts + recommendations
  plan         Print the exact plan that would run (no changes)
  report       Show the last run's report (use --json for machine-readable)
  undo         Best-effort rollback of the last run
  help         Show this help message

SAFETY & CONTROL
  --dry-run                Show actions, run nothing (same as plan)
  --deep                   Enable destructive cleanup steps (e.g. delete node_modules)
  --approve                Skip prompts, allow destructive steps (still logs)
  --force-fresh            Allow fresh rebuild actions (requires --deep or --approve)
  --focus <subsystem>      Restrict to: node | python | docker | all (default: all)
  --checks <list>          Run checks phase: lint,test,format (comma-separated)
  --kill-ports [ports]     Enable port cleanup. Optional comma-separated ports

OUTPUT & REPORTING
  --verbose                Print executed commands + stdout/stderr
  --quiet                  Minimal output (still prints final summary)
  --no-color               Disable ANSI coloring
  --json                   Print JSON report to stdout
  --report-path <path>     Override where to write reports
  --run                    With 'report' command: run fresh instead of reading latest

EXAMPLES
  auto-fix                 Run safe fixes for detected project
  auto-fix doctor          Diagnose without changing anything
  auto-fix plan            Preview what would run
  auto-fix --deep          Run with destructive cleanup enabled
  auto-fix --kill-ports    Kill processes on default ports first
  auto-fix report --json   Print last run report as JSON
  auto-fix undo            Rollback the last run (best-effort)

CONFIG
  Place .autofix.yml in your project root for custom settings.
  auto-fix works out-of-the-box without any config file.
`.trim());
}

function parseArgs(argv: string[]): { command: CommandContext["command"]; flags: CliFlags; help: boolean } {
  if (argv.length === 0) return { command: "run", flags: defaultFlags(), help: false };

  const hasHelp = argv.includes("--help") || argv.includes("-h") || argv[0] === "help";
  if (hasHelp) return { command: "run", flags: defaultFlags(), help: true };

  const [first, ...rest] = argv;
  const command: CommandContext["command"] =
    first === "doctor" || first === "plan" || first === "report" || first === "undo" ? first : "run";
  const args = command === "run" ? argv : rest;

  const flags = defaultFlags();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--deep") flags.deep = true;
    else if (arg === "--approve") flags.approve = true;
    else if (arg === "--force-fresh") flags.forceFresh = true;
    else if (arg === "--verbose") flags.verbose = true;
    else if (arg === "--quiet") flags.quiet = true;
    else if (arg === "--no-color") flags.noColor = true;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--run") flags.run = true;
    else if (arg === "--focus" && args[i + 1]) {
      const f = args[i + 1];
      if (f === "node" || f === "python" || f === "docker" || f === "all") flags.focus = f;
      i += 1;
    } else if (arg === "--checks" && args[i + 1]) {
      flags.checks = parseCsv(args[i + 1]).filter(
        (v): v is "lint" | "test" | "format" => v === "lint" || v === "test" || v === "format",
      );
      i += 1;
    } else if (arg === "--kill-ports") {
      if (args[i + 1] && !args[i + 1].startsWith("--")) {
        flags.killPorts = parseCsv(args[i + 1]).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
        i += 1;
      } else {
        flags.killPorts = [];
      }
    } else if (arg === "--report-path" && args[i + 1]) {
      flags.reportPath = args[i + 1];
      i += 1;
    }
  }

  if (command === "plan") flags.dryRun = true;
  return { command, flags, help: false };
}

function defaultFlags(): CliFlags {
  return {
    dryRun: false,
    deep: false,
    approve: false,
    forceFresh: false,
    focus: "all",
    verbose: false,
    quiet: false,
    noColor: false,
    json: false,
    run: false,
  };
}

async function main() {
  const { command, flags, help } = parseArgs(process.argv.slice(2));

  if (help) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const interactive = isInteractive();
  const ui = createRenderer(flags, interactive);

  const ctx: CommandContext = {
    command,
    cwd,
    runId: makeRunId(),
    flags,
    interactive,
  };

  const { config } = await loadConfig(cwd);
  const reportDir = path.resolve(cwd, flags.reportPath ?? config.output.report_dir);

  // ── undo ──
  if (command === "undo") {
    ui.intro("undo");
    ui.startTask("Reading latest report\u2026");
    const { report, entries } = await undoLatest(path.join(reportDir, "latest.json"), cwd);
    if (!report) {
      ui.stopTask("\u2717  No previous report found");
      if (!ui.isRich) console.error("No previous report found for undo.");
      process.exitCode = 1;
      return;
    }
    ui.stopTask("\u2714  Report loaded");
    ui.showDetection(report.detection);
    const failed = entries.reduce((acc, e) => acc + e.failed.length, 0);
    const restored = entries.reduce((acc, e) => acc + e.restored.length, 0);
    const missing = entries.reduce((acc, e) => acc + e.missingSnapshot.length, 0);
    const skipped = entries.reduce((acc, e) => acc + e.skipped.length, 0);
    ui.showUndoResults(restored, skipped, missing, failed);
    if (!ui.isRich) {
      console.log(`Restored: ${restored}, Skipped: ${skipped}, Missing snapshot: ${missing}, Failed: ${failed}`);
    }
    const next = entries.find((e) => e.nextBestAction)?.nextBestAction ?? "Run auto-fix doctor to validate";
    ui.outro(next);
    if (!ui.isRich) console.log(`Next: ${next}`);
    return;
  }

  // ── report (read-only) ──
  if (command === "report" && !flags.run) {
    ui.intro("report");
    const latest = await readJsonFile(path.join(reportDir, "latest.json"));
    if (!latest) {
      ui.showReportInfo("No report found at latest.json");
      if (!ui.isRich) console.error("No report found at latest.json");
      process.exitCode = 1;
      return;
    }
    if (flags.json) {
      console.log(JSON.stringify(latest, null, 2));
    } else {
      ui.showReportInfo("Report loaded. Use --json to print machine-readable output.");
      if (!ui.isRich) console.log("Use --json to print machine-readable report.");
    }
    ui.outro("auto-fix report --json");
    return;
  }

  // ── run / doctor / plan ──
  const effectiveCommand = command === "report" ? "run" : command;
  ui.intro(effectiveCommand);

  const callbacks = ui.isRich
    ? {
      onDetection: (det: import("./types.js").EnvDetection) => ui.showDetection(det),
      onPlanReady: (steps: import("./types.js").FixStep[]) => {
        if (effectiveCommand === "plan" || effectiveCommand === "doctor") {
          ui.showPlan(steps, effectiveCommand === "doctor" ? "Diagnosis" : undefined);
        }
      },
      stepHooks: effectiveCommand === "run" ? ui.createStepHooks() : undefined,
    }
    : undefined;

  const result = await runAutoFix({ ...ctx, command: effectiveCommand }, config, reportDir, callbacks);
  const report = result.report;
  await writeRunReport(report, reportDir);

  if (ui.isRich) {
    ui.showResults(report.summary);
    ui.outro(report.summary.nextBestAction);
  }

  // Fallback text output for non-rich modes
  if (!ui.isRich) {
    if (flags.quiet) {
      console.log(renderQuietSummary(report, !flags.noColor));
    } else {
      console.log(renderSummary(report, !flags.noColor));
    }
  }

  if (flags.json || command === "report") {
    console.log(JSON.stringify(report, null, 2));
  }

  if (effectiveCommand === "doctor" && report.detection.issues.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
