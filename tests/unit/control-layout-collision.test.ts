import test from "node:test";
import assert from "node:assert/strict";

import { detectControlLayoutCollision } from "../../src/renderer/components/controlLayoutCollision";

test("detectControlLayoutCollision reports overlapping controls", () => {
  const result = detectControlLayoutCollision({
    container: { left: 0, right: 120, top: 0, bottom: 40 },
    items: [
      { left: 0, right: 70, top: 0, bottom: 32 },
      { left: 64, right: 110, top: 0, bottom: 32 }
    ]
  });

  assert.equal(result.hasCollision, true);
  assert.equal(result.hasOverlap, true);
});

test("detectControlLayoutCollision reports wrapping, overflow, and clipped content", () => {
  const wrapped = detectControlLayoutCollision({
    container: { left: 0, right: 120, top: 0, bottom: 80 },
    items: [
      { left: 0, right: 54, top: 0, bottom: 32 },
      { left: 0, right: 54, top: 40, bottom: 72 }
    ]
  });
  assert.equal(wrapped.hasWrap, true);
  assert.equal(wrapped.hasCollision, true);

  const overflowed = detectControlLayoutCollision({
    container: { left: 0, right: 120, top: 0, bottom: 40 },
    items: [{ left: 96, right: 132, top: 0, bottom: 32 }]
  });
  assert.equal(overflowed.hasOverflow, true);
  assert.equal(overflowed.hasCollision, true);

  const clipped = detectControlLayoutCollision({
    container: { left: 0, right: 120, top: 0, bottom: 40 },
    items: [{ left: 0, right: 50, top: 0, bottom: 32 }],
    hasClippedContent: true
  });
  assert.equal(clipped.hasClippedContent, true);
  assert.equal(clipped.hasCollision, true);
});

test("detectControlLayoutCollision ignores separated controls", () => {
  const result = detectControlLayoutCollision({
    container: { left: 0, right: 140, top: 0, bottom: 40 },
    items: [
      { left: 0, right: 40, top: 0, bottom: 32 },
      { left: 48, right: 88, top: 0, bottom: 32 },
      { left: 96, right: 136, top: 0, bottom: 32 }
    ]
  });

  assert.deepEqual(result, {
    hasCollision: false,
    hasOverlap: false,
    hasWrap: false,
    hasOverflow: false,
    hasClippedContent: false
  });
});
