import path from "node:path";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import type { Config } from "../types.js";
import { defaultConfig } from "./defaults.js";
import { fileExists } from "../utils/fs.js";

function mergeDeep<T>(target: T, source: Partial<T>): T {
  const output = { ...target } as Record<string, unknown>;
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      output[key] = value;
      continue;
    }
    if (value && typeof value === "object") {
      const current = output[key];
      output[key] = mergeDeep((current ?? {}) as Record<string, unknown>, value as Record<string, unknown>);
      continue;
    }
    output[key] = value;
  }
  return output as T;
}

async function findConfigPath(cwd: string): Promise<string | null> {
  let current = cwd;
  while (true) {
    const candidate = path.join(current, ".autofix.yml");
    if (await fileExists(candidate)) return candidate;

    const gitDir = path.join(current, ".git");
    if (await fileExists(gitDir)) return null;

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function loadConfig(cwd: string): Promise<{ config: Config; path: string | null }> {
  const cfgPath = await findConfigPath(cwd);
  if (!cfgPath) return { config: defaultConfig, path: null };
  const raw = await readFile(cfgPath, "utf8");
  const user = parse(raw) as Partial<Config>;
  return { config: mergeDeep(defaultConfig, user), path: cfgPath };
}
