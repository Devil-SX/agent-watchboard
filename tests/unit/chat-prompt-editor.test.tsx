import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChatPromptEditor } from "../../src/renderer/components/ChatPromptEditor";

test("ChatPromptEditor renders reset and textarea controls for custom prompts", () => {
  const html = renderToStaticMarkup(
    <ChatPromptEditor
      agent="claude"
      prompt={{
        mode: "custom",
        text: "Summarize changes before acting."
      }}
      onPromptChange={() => undefined}
    />
  );

  assert.match(html, /System Prompt/);
  assert.match(html, /Mode/);
  assert.match(html, /Reset/);
  assert.match(html, /Summarize changes before acting\./);
  assert.match(html, /next chat start/);
});
