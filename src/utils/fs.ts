import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

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
