import path from "node:path";
import { cp } from "node:fs/promises";
import type { RunReport, UndoEntry } from "../types.js";
import { readJsonFile } from "../utils/fs.js";

export async function undoLatest(reportPath: string, cwd: string): Promise<{ report: RunReport | null; entries: UndoEntry[] }> {
  const report = await readJsonFile<RunReport>(reportPath);
  if (!report) return { report: null, entries: [] };

  const entries: UndoEntry[] = [];

  for (const step of report.steps) {
    if (!step.snapshotPaths || step.snapshotPaths.length === 0) continue;

    const restored: string[] = [];
    const failed: string[] = [];

    for (const snap of step.snapshotPaths) {
      const base = path.basename(snap);
      const target = path.join(cwd, base.replace(/_/g, "/"));
      try {
        await cp(snap, target, { recursive: true, force: true });
        restored.push(target);
      } catch {
        failed.push(target);
      }
    }

    entries.push({ stepId: step.id, snapshotPaths: step.snapshotPaths, restored, failed });
  }

  return { report, entries };
}
