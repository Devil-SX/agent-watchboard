import test from "node:test";
import assert from "node:assert/strict";

import { scrollActivePathSuggestionIntoView } from "../../src/renderer/components/pathSuggestionScroll";

test("scrollActivePathSuggestionIntoView scrolls the active suggestion into view", () => {
  const calls: Array<ScrollIntoViewOptions | undefined> = [];
  const container = {
    children: [
      {
        scrollIntoView: (options?: ScrollIntoViewOptions) => {
          calls.push(options);
        }
      },
      {
        scrollIntoView: (options?: ScrollIntoViewOptions) => {
          calls.push(options);
        }
      }
    ]
  };

  scrollActivePathSuggestionIntoView(container, 1);

  assert.deepEqual(calls, [{ block: "nearest" }]);
});

test("scrollActivePathSuggestionIntoView ignores invalid indices and missing containers", () => {
  let called = false;
  const container = {
    children: [
      {
        scrollIntoView: () => {
          called = true;
        }
      }
    ]
  };

  scrollActivePathSuggestionIntoView(null, 0);
  scrollActivePathSuggestionIntoView(container, -1);
  scrollActivePathSuggestionIntoView(container, 3);

  assert.equal(called, false);
});
