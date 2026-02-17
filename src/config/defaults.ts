import type { Config } from "../types.js";

export const defaultConfig: Config = {
  version: 1,
  ports: {
    default: [3000, 5173, 8000, 8080],
    extra: [9229],
  },
  node: {
    package_manager: "auto",
    deep_cleanup: {
      remove_node_modules: true,
      remove_lockfile: false,
    },
    caches: {
      next: true,
      vite: true,
      directories: [".turbo", ".cache"],
    },
  },
  python: {
    venv_path: ".venv",
    install: {
      prefer: "uv",
    },
    tools: {
      format: ["ruff format", "black ."],
      lint: ["ruff check ."],
      test: ["pytest -q"],
    },
  },
  docker: {
    compose_file: "auto",
    safe_down: true,
    rebuild: true,
    prune: false,
  },
  checks: {
    default: ["lint", "format", "test"],
  },
  output: {
    report_dir: ".autofix/reports",
    snapshot_dir: ".autofix/snapshots",
    verbosity: "normal",
  },
};
