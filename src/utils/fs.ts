import { access, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";

export async function fileExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function ensureWritableDir(dir: string): Promise<boolean> {
  try {
    await ensureDir(dir);
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(target: string): Promise<T | null> {
  if (!(await fileExists(target))) return null;
  const content = await readFile(target, "utf8");
  return JSON.parse(content) as T;
}

export async function writeJsonFile(target: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(target));
  await writeFile(target, JSON.stringify(data, null, 2), "utf8");
}

export async function copyPath(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await cp(src, dest, { recursive: true, force: true });
}

export async function ensureAutofixInGitignore(cwd: string): Promise<boolean> {
  let current = cwd;
  while (true) {
    const gitDir = path.join(current, ".git");
    if (await fileExists(gitDir)) {
      const gitignore = path.join(current, ".gitignore");
      const exists = await fileExists(gitignore);
      const body = exists ? await readFile(gitignore, "utf8") : "";
      if (!body.split(/\r?\n/).includes(".autofix/")) {
        const next = `${body}${body.endsWith("\n") || body.length === 0 ? "" : "\n"}.autofix/\n`;
        await writeFile(gitignore, next, "utf8");
        return true;
      }
      return false;
    }
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}
