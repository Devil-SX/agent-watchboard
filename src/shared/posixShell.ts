export function quotePosixShellArgument(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
