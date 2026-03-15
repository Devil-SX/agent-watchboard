export const WATCHBOARD_HEADLESS_TEST_ARG = "--watchboard-headless-test";
export const WATCHBOARD_DISABLE_GPU_ARG = "--watchboard-disable-gpu";

export function isWatchboardHeadlessTest(argv: readonly string[] = process.argv, env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WATCHBOARD_HEADLESS_TEST === "1" || argv.includes(WATCHBOARD_HEADLESS_TEST_ARG);
}

export function shouldDisableGpuForWatchboard(argv: readonly string[] = process.argv, env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WATCHBOARD_DISABLE_GPU === "1" || argv.includes(WATCHBOARD_DISABLE_GPU_ARG);
}
