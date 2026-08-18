const colors = {
  cyan: '\u001b[36m',
  magenta: '\u001b[35m',
  white: '\u001b[97m',
  gray: '\u001b[90m',
  reset: '\u001b[0m',
} as const;

export function printStartupBanner(): void {
  if (!process.stdout.isTTY && process.env.LOG_FORMAT !== 'pretty') return;

  const line = `${colors.gray}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`;
  process.stdout.write(
    `\n${line}\n` +
      `${colors.cyan}  ◉${colors.reset} ${colors.white}RADIO CONNECT MUSIC 24/7${colors.reset}\n` +
      `${colors.magenta}  ♪${colors.reset} ${colors.gray}Discord Web Radio • produção contínua${colors.reset}\n` +
      `${line}\n\n`,
  );
}
