import { exec } from "node:child_process";
import type { ExecException } from "node:child_process";

export interface CommandResult {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export function runShellCommand(command: string, cwd: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    exec(command, { cwd, maxBuffer: 1024 * 1024 * 4 }, (error: ExecException | null, stdout: string, stderr: string) => {
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
