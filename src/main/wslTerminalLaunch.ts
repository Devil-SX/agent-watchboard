export function normalizeWslShellCwd(cwd: string): string {
  if (/^[a-zA-Z]:\\/.test(cwd)) {
    const drive = cwd[0]?.toLowerCase() ?? "c";
    const normalized = cwd.slice(2).replaceAll("\\", "/");
    return quoteForPosix(`/mnt/${drive}${normalized}`);
  }
  if (cwd === "~") {
    return "~";
  }
  if (cwd.startsWith("~/")) {
    return cwd;
  }
  return quoteForPosix(cwd);
}

export function buildWslLaunchCommand(cwd: string, shell: string, startupCommand: string): string {
  const targetCwd = normalizeWslShellCwd(cwd);
  const cdCommand = `if ! cd -- ${targetCwd} 2>/dev/null; then printf '\\n[watchboard] cwd unavailable, falling back to $HOME\\n'; cd -- "$HOME"; fi`;
  if (!startupCommand.trim()) {
    return `${cdCommand}; exec "\${SHELL:-${shell.replaceAll('"', '\\"')}}" -il`;
  }
  return `${cdCommand}; ${buildWslStartupCommand(shell, startupCommand)}`;
}

export function buildWslStartupCommand(shell: string, startupCommand: string): string {
  const escapedCommand = startupCommand.replaceAll('"', '\\"');
  const escapedShell = shell.replaceAll('"', '\\"');
  return `${escapedCommand}; status=$?; if [ "\${status:-}" != "0" ]; then printf '\\n[watchboard] startup command failed (%s), falling back to interactive shell\\n' "\${status:-unknown}"; exec "\${SHELL:-${escapedShell}}" -il; fi`;
}

function quoteForPosix(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
