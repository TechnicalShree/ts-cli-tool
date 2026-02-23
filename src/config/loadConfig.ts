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
/** Allowlist pattern for safe characters in config command/path strings */
const SAFE_CHARS_RE = /^[a-zA-Z0-9._\-/@:=*\s]+$/;

/** Known dev tool binaries that are safe to auto-execute */
const KNOWN_TOOL_BINARIES = new Set([
  "ruff", "black", "autopep8", "yapf", "isort", "pyink",
  "flake8", "pylint", "pyflakes", "pydocstyle", "pycodestyle", "bandit", "vulture",
  "mypy", "pyright", "pytype", "pyre",
  "pytest", "unittest", "nose2", "tox", "nox", "coverage",
  "pip", "uv", "poetry", "pipenv", "pdm",
  "python", "python3", "pre-commit", "sphinx-build",
  "npm", "npx", "pnpm", "yarn",
]);

function isSafeConfigCommand(cmd: string): boolean {
  if (!SAFE_CHARS_RE.test(cmd)) return false;
  const binary = cmd.trim().split(/\s+/)[0].replace(/^.*\//, "");
  return KNOWN_TOOL_BINARIES.has(binary);
}

/**
 * REL-004: Defense-in-depth — strip unsafe values from config at load time.
 * Uses character allowlist + known binary allowlist to prevent arbitrary command execution.
 */
function sanitizeConfig(config: Config): Config {
  // Sanitize python tool command arrays
  if (config.python?.tools) {
    config.python.tools.format = config.python.tools.format.filter(isSafeConfigCommand);
    config.python.tools.lint = config.python.tools.lint.filter(isSafeConfigCommand);
    config.python.tools.test = config.python.tools.test.filter(isSafeConfigCommand);
  }
  // Sanitize node cache directory names (path-only, no binary check needed)
  if (config.node?.caches?.directories) {
    config.node.caches.directories = config.node.caches.directories.filter((d) => SAFE_CHARS_RE.test(d) && !d.includes(".."));
  }
  return config;
}

export async function loadConfig(cwd: string): Promise<{ config: Config; path: string | null }> {
  const cfgPath = await findConfigPath(cwd);
  if (!cfgPath) return { config: defaultConfig, path: null };
  const raw = await readFile(cfgPath, "utf8");
  const user = parse(raw) as Partial<Config> | null;
  if (!user || typeof user !== "object") return { config: defaultConfig, path: cfgPath };
  const merged = mergeDeep(defaultConfig, user);
  return { config: sanitizeConfig(merged), path: cfgPath };
}
