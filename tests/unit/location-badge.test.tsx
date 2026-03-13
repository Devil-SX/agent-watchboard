import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocationBadge, getLocationLabel } from "../../src/renderer/components/LocationBadge";

test("LocationBadge renders distinct host and WSL variants", () => {
  const hostHtml = renderToStaticMarkup(<LocationBadge location="host" tone="strong" />);
  const wslHtml = renderToStaticMarkup(<LocationBadge location="wsl" />);

  assert.match(hostHtml, /location-badge is-host is-strong/);
  assert.match(hostHtml, />Host</);
  assert.match(wslHtml, /location-badge is-wsl/);
  assert.match(wslHtml, />WSL</);
  assert.equal(getLocationLabel("host"), "Host");
  assert.equal(getLocationLabel("wsl"), "WSL");
});
