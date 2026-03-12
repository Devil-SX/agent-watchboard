import React from "react";
import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "flexlayout-react/style/dark.css";

import { App } from "@renderer/App";
import { AppErrorBoundary } from "@renderer/components/AppErrorBoundary";
import "@renderer/styles.css";

window.addEventListener("error", (event) => {
  console.error("renderer-window-error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("renderer-unhandledrejection", {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason)
  });
});

console.info("renderer-bootstrap");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
