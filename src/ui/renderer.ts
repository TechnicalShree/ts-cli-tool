import * as p from "@clack/prompts";
import type { CliFlags, EnvDetection, FixStep, RunSummary } from "../types.js";

const S = {
    ok: "\u2714",
    fail: "\u2717",
    skip: "\u23ED",
    warn: "\u25B2",
    irr: "\u26A0",
    dot: "\u25CF",
    diamond: "\u25C6",
} as const;

export interface StepHooks {
    onStepStart(step: FixStep): void;
    onStepEnd(step: FixStep): void;
    onConfirm(question: string): Promise<boolean>;
}

export function createRenderer(flags: CliFlags, interactive: boolean) {
    const rich = interactive && !flags.quiet && !flags.json;
    const spin = rich ? p.spinner() : null;
    let spinRunning = false;

    return {
        isRich: rich,

        intro(command: string) {
            if (!rich) return;
            const tags: string[] = [];
            if (flags.deep) tags.push("deep");
            if (flags.approve) tags.push("approve");
            if (flags.forceFresh) tags.push("force-fresh");
            if (flags.focus !== "all") tags.push(`focus:${flags.focus}`);
            if (flags.killPorts) tags.push("kill-ports");
            const extra = tags.length ? ` [${tags.join(", ")}]` : "";
            p.intro(`auto-fix \u00B7 ${command}${extra}`);
        },

        showDetection(detection: EnvDetection) {
            if (!rich) return;
            const parts: string[] = [];
            if (detection.node.detected) parts.push(`Node (${detection.node.packageManager})`);
            if (detection.python.detected) parts.push("Python");
            if (detection.docker.detected) parts.push("Docker Compose");
            p.log.info(`Detected: ${parts.join(", ") || "No supported project detected"}`);
            for (const issue of detection.issues) {
                p.log.warn(issue);
            }
        },

        showPlan(steps: FixStep[], label?: string) {
            if (!rich) return;
            if (steps.length === 0) {
                p.log.info("No actions to take.");
                return;
            }
            const lines = steps.map((s) => {
                const prefix = s.irreversible ? S.irr : s.destructive ? S.diamond : S.dot;
                const irr = s.irreversible ? " [IRREVERSIBLE]" : "";
                const reason = s.proposedReason ? ` \u2014 ${s.proposedReason}` : "";
                return `  ${prefix}  ${s.title}${irr}${reason}`;
            });
            p.note(lines.join("\n"), label ?? `Plan \u2014 ${steps.length} step(s)`);
        },

        createStepHooks(): StepHooks {
            return {
                onStepStart: (step: FixStep) => {
                    if (!rich || !spin) return;
                    spin.start(step.title);
                    spinRunning = true;
                },
                onStepEnd: (step: FixStep) => {
                    if (!rich) return;
                    if (spinRunning && spin) {
                        const msg =
                            step.status === "success"
                                ? `${S.ok}  ${step.title}`
                                : step.status === "failed"
                                    ? `${S.fail}  ${step.title}${step.error ? ` \u2014 ${step.error}` : ""}`
                                    : `${S.skip}  ${step.title}${step.proposedReason ? ` (${step.proposedReason})` : ""}`;
                        spin.stop(msg);
                        spinRunning = false;
                    } else {
                        const symbol = step.status === "proposed" ? S.skip : S.dot;
                        const reason = step.proposedReason ? ` (${step.proposedReason})` : "";
                        p.log.warn(`${symbol}  ${step.title}${reason}`);
                    }
                },
                onConfirm: async (question: string): Promise<boolean> => {
                    if (!rich) return false;
                    if (spinRunning && spin) {
                        spin.stop();
                        spinRunning = false;
                    }
                    const result = await p.confirm({ message: question });
                    if (p.isCancel(result)) {
                        p.cancel("Operation cancelled.");
                        process.exit(0);
                    }
                    return result;
                },
            };
        },

        showResults(summary: RunSummary) {
            if (!rich) return;
            const parts: string[] = [];
            if (summary.succeeded > 0) parts.push(`${S.ok} ${summary.succeeded} succeeded`);
            if (summary.failed > 0) parts.push(`${S.fail} ${summary.failed} failed`);
            if (summary.skipped > 0) parts.push(`${S.skip} ${summary.skipped} skipped/proposed`);
            p.log.success(parts.join("  "));
            if (summary.irreversibleStepIds.length > 0) {
                p.log.warn(`Undo coverage: partial \u2014 ${summary.irreversibleStepIds.join(", ")} not undoable`);
            }
            for (const w of summary.warnings) {
                p.log.warn(w);
            }
        },

        showUndoResults(restored: number, skipped: number, missing: number, failed: number) {
            if (!rich) return;
            const parts: string[] = [];
            if (restored > 0) parts.push(`${S.ok} ${restored} restored`);
            if (skipped > 0) parts.push(`${S.skip} ${skipped} skipped`);
            if (missing > 0) parts.push(`${S.warn} ${missing} missing snapshot`);
            if (failed > 0) parts.push(`${S.fail} ${failed} failed`);
            p.log.success(parts.join("  "));
        },

        showReportInfo(msg: string) {
            if (!rich) return;
            p.log.info(msg);
        },

        startTask(msg: string) {
            if (!rich || !spin) return;
            spin.start(msg);
            spinRunning = true;
        },

        stopTask(msg: string) {
            if (!rich || !spin || !spinRunning) return;
            spin.stop(msg);
            spinRunning = false;
        },

        outro(message: string) {
            if (!rich) return;
            p.outro(`Next \u2192 ${message}`);
        },
    };
}

export type TuiRenderer = ReturnType<typeof createRenderer>;
