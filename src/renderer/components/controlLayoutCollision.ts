export type ControlRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ControlLayoutCollisionInput = {
  container: ControlRect;
  items: ControlRect[];
  hasScrollOverflow?: boolean;
  hasClippedContent?: boolean;
  epsilon?: number;
};

export type ControlLayoutCollisionResult = {
  hasCollision: boolean;
  hasOverlap: boolean;
  hasWrap: boolean;
  hasOverflow: boolean;
  hasClippedContent: boolean;
};

export function detectControlLayoutCollision(input: ControlLayoutCollisionInput): ControlLayoutCollisionResult {
  const epsilon = input.epsilon ?? 1;
  const visibleItems = input.items.filter((item) => item.right - item.left > epsilon && item.bottom - item.top > epsilon);
  const hasOverlap = visibleItems.some((item, index) =>
    visibleItems.slice(index + 1).some((other) => rectsOverlap(item, other, epsilon))
  );
  const firstTop = visibleItems[0]?.top ?? input.container.top;
  const hasWrap = visibleItems.some((item) => Math.abs(item.top - firstTop) > epsilon);
  const hasItemOverflow = visibleItems.some(
    (item) =>
      item.left < input.container.left - epsilon ||
      item.right > input.container.right + epsilon ||
      item.top < input.container.top - epsilon ||
      item.bottom > input.container.bottom + epsilon
  );
  const hasOverflow = Boolean(input.hasScrollOverflow) || hasItemOverflow;
  const hasClippedContent = Boolean(input.hasClippedContent);

  return {
    hasCollision: hasOverlap || hasWrap || hasOverflow || hasClippedContent,
    hasOverlap,
    hasWrap,
    hasOverflow,
    hasClippedContent
  };
}

function rectsOverlap(left: ControlRect, right: ControlRect, epsilon: number): boolean {
  const horizontalOverlap = left.left < right.right - epsilon && left.right > right.left + epsilon;
  const verticalOverlap = left.top < right.bottom - epsilon && left.bottom > right.top + epsilon;
  return horizontalOverlap && verticalOverlap;
}
