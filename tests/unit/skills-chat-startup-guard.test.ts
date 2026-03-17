import test from "node:test";
import assert from "node:assert/strict";

import { canStartSkillsChatSession } from "../../src/renderer/components/skillsChatStartup";

test("canStartSkillsChatSession blocks startup while the skills scan is still loading", () => {
  assert.equal(
    canStartSkillsChatSession("skills", true, "wsl", {
      location: "wsl",
      isLoading: true,
      error: "",
      warning: "",
      warningCode: null
    }),
    false
  );
});

test("canStartSkillsChatSession blocks startup when the scan reported a safety warning", () => {
  assert.equal(
    canStartSkillsChatSession("skills", true, "wsl", {
      location: "wsl",
      isLoading: false,
      error: "",
      warning: "truncated",
      warningCode: "scan-safety-limit"
    }),
    false
  );
});

test("canStartSkillsChatSession only allows startup once the matching scan finished cleanly", () => {
  assert.equal(
    canStartSkillsChatSession("skills", true, "wsl", {
      location: "wsl",
      isLoading: false,
      error: "",
      warning: "",
      warningCode: null
    }),
    true
  );
  assert.equal(
    canStartSkillsChatSession("skills", true, "wsl", {
      location: "host",
      isLoading: false,
      error: "",
      warning: "",
      warningCode: null
    }),
    false
  );
});
