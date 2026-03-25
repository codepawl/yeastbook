// ANSI escape codes — Bun supports color natively, no dependencies needed
const ESC = "\x1b";
const c = {
  reset:  `${ESC}[0m`,
  bold:   `${ESC}[1m`,
  dim:    `${ESC}[2m`,
  amber:  `${ESC}[38;2;217;119;6m`,    // #D97706 — brand color
  white:  `${ESC}[97m`,
  gray:   `${ESC}[90m`,
  green:  `${ESC}[38;2;22;163;74m`,
  red:    `${ESC}[38;2;220;38;38m`,
  blue:   `${ESC}[38;2;59;130;246m`,
  cyan:   `${ESC}[36m`,
};

function isTTY(): boolean {
  return process.stdout.isTTY ?? false;
}

function color(code: string, text: string): string {
  if (!isTTY()) return text;
  return `${code}${text}${c.reset}`;
}

export const logger = {
  banner(version: string) {
    if (!isTTY()) {
      console.log(`yeastbook v${version}`);
      return;
    }
    console.log();
    console.log(
      color(c.amber + c.bold, "  \u{1F35E} yeastbook") +
      color(c.gray, ` v${version}`),
    );
    console.log();
  },

  info(key: string, value: string) {
    const paddedKey = key.padEnd(10);
    console.log(
      color(c.gray, "  \u2726 ") +
      color(c.dim, paddedKey) +
      color(c.white, value),
    );
  },

  divider() {
    if (!isTTY()) return;
    console.log(color(c.gray, "\n  " + "\u2504".repeat(33) + "\n"));
  },

  success(msg: string) {
    console.log(color(c.green, "  \u2713 ") + msg);
  },

  warn(msg: string) {
    console.log(color(c.amber, "  \u26A0 ") + msg);
  },

  error(msg: string) {
    console.error(color(c.red, "  \u2717 ") + msg);
  },

  hint(msg: string) {
    console.log(color(c.gray, "  " + msg));
  },

  event(type: string, detail: string) {
    if (!isTTY()) return;
    const time = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    console.log(
      color(c.gray, `  ${time} `) +
      color(c.amber, type.padEnd(12)) +
      color(c.dim, detail),
    );
  },

  clearLine() {
    if (!isTTY()) return;
    process.stdout.write("\r\x1b[K");
  },
};
