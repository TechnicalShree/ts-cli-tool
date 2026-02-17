const reset = "\u001b[0m";
const bold = "\u001b[1m";
const green = "\u001b[32m";
const red = "\u001b[31m";
const yellow = "\u001b[33m";
const cyan = "\u001b[36m";

function wrap(enabled: boolean, code: string, value: string): string {
  return enabled ? `${code}${value}${reset}` : value;
}

export function style(enabled: boolean) {
  return {
    title: (v: string) => wrap(enabled, `${bold}${cyan}`, v),
    ok: (v: string) => wrap(enabled, green, v),
    warn: (v: string) => wrap(enabled, yellow, v),
    err: (v: string) => wrap(enabled, red, v),
    strong: (v: string) => wrap(enabled, bold, v),
  };
}
