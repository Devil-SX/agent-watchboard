import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SkillMarkdownDocument } from "../../src/renderer/components/SkillMarkdownDocument";

test("SkillMarkdownDocument renders markdown structure instead of raw preformatted text", () => {
  const html = renderToStaticMarkup(
    <SkillMarkdownDocument
      content={`# Title

- first
- second

\`inline\`

\`\`\`bash
echo ok
\`\`\`
`}
    />
  );

  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<li>first<\/li>/);
  assert.match(html, /<code>inline<\/code>/);
  assert.match(html, /<pre class="skills-markdown-pre"><code class="language-bash">echo ok/);
});
