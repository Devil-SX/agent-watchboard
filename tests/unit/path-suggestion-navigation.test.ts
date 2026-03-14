import test from "node:test";
import assert from "node:assert/strict";

import { movePathSuggestionIndex } from "../../src/renderer/components/pathSuggestionNavigation";

test("movePathSuggestionIndex enters the list from no selection", () => {
  assert.equal(movePathSuggestionIndex(-1, 3, "down"), 0);
  assert.equal(movePathSuggestionIndex(-1, 3, "up"), 2);
});

test("movePathSuggestionIndex wraps around in both directions", () => {
  assert.equal(movePathSuggestionIndex(2, 3, "down"), 0);
  assert.equal(movePathSuggestionIndex(0, 3, "up"), 2);
});

test("movePathSuggestionIndex keeps no selection when the list is empty", () => {
  assert.equal(movePathSuggestionIndex(-1, 0, "down"), -1);
  assert.equal(movePathSuggestionIndex(1, 0, "up"), -1);
});
