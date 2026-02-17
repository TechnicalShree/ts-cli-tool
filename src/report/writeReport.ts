import path from "node:path";
import type { RunReport } from "../types.js";
import { writeJsonFile } from "../utils/fs.js";

export async function writeRunReport(report: RunReport, reportDir: string): Promise<{ runReportPath: string; latestPath: string }> {
  const runReportPath = path.join(reportDir, `${report.runId}.json`);
  const latestPath = path.join(reportDir, "latest.json");
  await writeJsonFile(runReportPath, report);
  await writeJsonFile(latestPath, report);
  return { runReportPath, latestPath };
}
