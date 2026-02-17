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

function makeRunId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseArgs(argv: string[]): { command: CommandContext["command"]; flags: CliFlags } {
  const [first, ...rest] = argv;
  const command: CommandContext["command"] =
    first === "doctor" || first === "plan" || first === "report" || first === "undo" ? first : "run";
  const args = command === "run" ? argv : rest;

  const flags: CliFlags = {
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
  return { command, flags };
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  const ctx: CommandContext = {
    command,
    cwd,
    runId: makeRunId(),
    flags,
    interactive: isInteractive(),
  };

  const { config } = await loadConfig(cwd);
  const reportDir = path.resolve(cwd, flags.reportPath ?? config.output.report_dir);

  if (command === "undo") {
    const { report, entries } = await undoLatest(path.join(reportDir, "latest.json"), cwd);
    if (!report) {
      console.error("No previous report found for undo.");
      process.exitCode = 1;
      return;
    }
    console.log("Detected environment");
    console.log(`- ${report.summary.detectedEnvironment.join(", ")}`);
    console.log("Plan/Actions");
    console.log(`- Attempted undo for ${entries.length} item(s)`);
    console.log("Results");
    const failed = entries.reduce((acc, e) => acc + e.failed.length, 0);
    const restored = entries.reduce((acc, e) => acc + e.restored.length, 0);
    const missing = entries.reduce((acc, e) => acc + e.missingSnapshot.length, 0);
    const skipped = entries.reduce((acc, e) => acc + e.skipped.length, 0);
    console.log(`- Restored: ${restored}, Skipped: ${skipped}, Missing snapshot: ${missing}, Failed: ${failed}`);
    const next = entries.find((e) => e.nextBestAction)?.nextBestAction ?? "Run auto-fix doctor to validate and recover manually";
    console.log("Next best action");
    console.log(`- ${next}`);
    return;
  }

  if (command === "report" && !flags.run) {
    const latest = await readJsonFile(path.join(reportDir, "latest.json"));
    if (!latest) {
      console.error("No report found at latest.json");
      process.exitCode = 1;
      return;
    }
    if (flags.json) console.log(JSON.stringify(latest, null, 2));
    else console.log("Use --json to print machine-readable report.");
    return;
  }

  const effectiveCommand = command === "report" ? "run" : command;
  const result = await runAutoFix({ ...ctx, command: effectiveCommand }, config, reportDir);
  const report = result.report;
  await writeRunReport(report, reportDir);

  if (flags.quiet) {
    console.log(renderQuietSummary(report, !flags.noColor));
  } else {
    console.log(renderSummary(report, !flags.noColor));
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
