export const TERMINAL_RESIZE_SETTLE_MS = 100;
export const TERMINAL_RESIZE_MIN_PIXEL_DELTA = 2;

export type TerminalHostSize = {
  width: number;
  height: number;
};

export type TerminalGeometry = {
  cols: number;
  rows: number;
};

export function resolveTerminalRedrawNudgeGeometry(
  geometry: TerminalGeometry | null | undefined
): { transient: TerminalGeometry; restored: TerminalGeometry } | null {
  if (!geometry || geometry.cols <= 1 || geometry.rows <= 0) {
    return null;
  }
  const restored = { cols: geometry.cols, rows: geometry.rows };
  const transientCols = geometry.cols > 2 ? geometry.cols - 1 : geometry.cols + 1;
  if (transientCols === restored.cols || transientCols <= 0) {
    return null;
  }
  return {
    transient: {
      cols: transientCols,
      rows: geometry.rows
    },
    restored
  };
}

export function isTerminalHostMeasurable(size: TerminalHostSize | null | undefined): boolean {
  return Boolean(size && size.width > 0 && size.height > 0);
}

export function hasMeaningfulTerminalSizeChange(
  previousSize: TerminalHostSize | null | undefined,
  nextSize: TerminalHostSize | null | undefined,
  minPixelDelta = TERMINAL_RESIZE_MIN_PIXEL_DELTA
): boolean {
  if (!isTerminalHostMeasurable(nextSize)) {
    return false;
  }
  if (!isTerminalHostMeasurable(previousSize)) {
    return true;
  }
  return (
    Math.abs((nextSize?.width ?? 0) - (previousSize?.width ?? 0)) >= minPixelDelta ||
    Math.abs((nextSize?.height ?? 0) - (previousSize?.height ?? 0)) >= minPixelDelta
  );
}

export function shouldCommitTerminalResize(
  previousGeometry: TerminalGeometry | null | undefined,
  nextGeometry: TerminalGeometry | null | undefined
): boolean {
  if (!nextGeometry || nextGeometry.cols <= 0 || nextGeometry.rows <= 0) {
    return false;
  }
  if (!previousGeometry) {
    return true;
  }
  return previousGeometry.cols !== nextGeometry.cols || previousGeometry.rows !== nextGeometry.rows;
}
