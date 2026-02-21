import path from "node:path";
import { cp, mkdir } from "node:fs/promises";
import type { RunReport, UndoEntry } from "../types.js";
import { fileExists, readJsonFile } from "../utils/fs.js";

export async function undoLatest(reportPath: string, cwd: string): Promise<{ report: RunReport | null; entries: UndoEntry[] }> {
  const report = await readJsonFile<RunReport>(reportPath);
  if (!report) return { report: null, entries: [] };

  const entries: UndoEntry[] = [];

  for (const step of report.steps) {
    const restored: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];
    const missingSnapshot: string[] = [];

    if (!step.undoable || !step.snapshotPaths || step.snapshotPaths.length === 0) {
      skipped.push("not undoable or no snapshot");
      entries.push({
        stepId: step.id,
        snapshotPaths: step.snapshotPaths ?? [],
        restored,
        skipped,
        missingSnapshot,
        failed,
        nextBestAction: step.undoHints?.[0]?.command,
      });
      continue;
    }

    for (const snap of step.snapshotPaths) {
      if (!(await fileExists(snap))) {
        missingSnapshot.push(snap);
        continue;
      }
      // The snapshot filename encodes the original relative path with separators replaced by `_`.
      // Extract just the filename portion (after the stepId directory) and reverse the encoding.
      const base = path.basename(snap);
      const relativePath = base.replace(/_/g, path.sep);
      const target = path.join(cwd, relativePath);
      try {
        const targetDir = path.dirname(target);
        await mkdir(targetDir, { recursive: true });
        await cp(snap, target, { recursive: true, force: true });
        restored.push(target);
      } catch {
        failed.push(target);
      }
    }

    entries.push({
      stepId: step.id,
      snapshotPaths: step.snapshotPaths,
      restored,
      skipped,
      missingSnapshot,
      failed,
      nextBestAction: step.undoHints?.[0]?.command,
    });
  }

  return { report, entries };
}
