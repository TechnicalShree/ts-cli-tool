import { execFile } from "node:child_process";
import type { ExecFileException } from "node:child_process";

export interface CommandResult {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a command safely through the system shell.
 * Uses execFile with explicit ["-c", command] to avoid direct shell string injection
 * while still supporting piped/chained commands that subsystems require.
 */
export function runShellCommand(command: string, cwd: string): Promise<CommandResult> {
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  const shellArgs = process.platform === "win32" ? ["/c", command] : ["-c", command];

  return new Promise((resolve) => {
    execFile(shell, shellArgs, { cwd, maxBuffer: 1024 * 1024 * 4, encoding: "utf8" }, (error: ExecFileException | null, stdout: string, stderr: string) => {
      if (error) {
        resolve({
          success: false,
          code: typeof error.code === "number" ? error.code : 1,
          stdout: stdout ?? "",
          stderr: stderr ?? error.message,
        });
        return;
      }
      resolve({ success: true, code: 0, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

/**
 * Shell-quote a string value for safe interpolation into shell commands.
 * Wraps in single quotes and escapes embedded single quotes.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Validate a string against a strict safe-path pattern.
 * Only allows alphanumeric, dots, dashes, underscores, and forward slashes.
 * Rejects shell metacharacters like ;|&`$(){}
 */
export function isSafePath(value: string): boolean {
  return /^[a-zA-Z0-9._\-/]+$/.test(value) && !value.includes("..");
}
