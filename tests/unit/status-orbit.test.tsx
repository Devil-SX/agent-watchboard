import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StatusOrbit } from "../../src/renderer/components/StatusOrbit";

test("StatusOrbit renders two explicit 180-degree comet effects instead of dash-repeated trails", () => {
  const html = renderToStaticMarkup(<StatusOrbit active variant="workspace" />);

  assert.match(html, /class="status-orbit is-workspace"/);
  assert.match(html, /class="status-orbit-path is-aura"/);
  assert.match(html, /class="status-orbit-path is-track"/);
  assert.match(html, /d="M 15\.5 4\.5 H 84\.5 A 11 11 0 0 1 95\.5 15\.5 V 84\.5 A 11 11 0 0 1 84\.5 95\.5 H 15\.5 A 11 11 0 0 1 4\.5 84\.5 V 15\.5 A 11 11 0 0 1 15\.5 4\.5"/);
  assert.match(html, /class="status-orbit-comet is-primary"/);
  assert.match(html, /class="status-orbit-comet is-secondary"/);
  assert.match(html, /class="status-orbit-comet-glow"/);
  assert.match(html, /class="status-orbit-comet-core"/);
  assert.equal(html.match(/class="status-orbit-comet is-/g)?.length, 2);
  assert.match(html, /dur="2\.55s" begin="0s"/);
  assert.match(html, /dur="2\.55s" begin="-1\.275s"/);
  assert.doesNotMatch(html, /status-orbit-trail/);
  assert.doesNotMatch(html, /status-orbit-trail-stroke/);
  assert.doesNotMatch(html, /status-orbit-beacon/);
  assert.doesNotMatch(html, /<circle/);
});
