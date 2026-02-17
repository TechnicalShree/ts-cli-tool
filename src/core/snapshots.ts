import path from "node:path";
import { cp } from "node:fs/promises";
import { ensureDir, fileExists } from "../utils/fs.js";

export async function snapshotPathsForStep(
  cwd: string,
  snapshotRoot: string,
  stepId: string,
  candidates: string[],
): Promise<string[]> {
  const created: string[] = [];
  for (const candidate of candidates) {
    const source = path.join(cwd, candidate);
    if (!(await fileExists(source))) continue;
    const dest = path.join(snapshotRoot, stepId, candidate.replace(/[\\/:]/g, "_"));
    await ensureDir(path.dirname(dest));
    await cp(source, dest, { recursive: true, force: true });
    created.push(dest);
  }
  return created;
}
