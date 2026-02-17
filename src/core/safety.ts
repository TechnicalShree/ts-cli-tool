import type { CommandContext, FixStep } from "../types.js";

export function needsApproval(step: FixStep): boolean {
  return step.destructive;
}

export function canAutoRunDestructive(ctx: CommandContext): boolean {
  return ctx.flags.deep || ctx.flags.approve;
}

export function shouldPromptForDestructive(ctx: CommandContext, step: FixStep): boolean {
  return needsApproval(step) && !canAutoRunDestructive(ctx) && ctx.interactive;
}
