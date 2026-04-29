import { Component, type ErrorInfo, type ReactNode } from "react";

import { ContentTabsShell, WindowShell } from "@renderer/components/ChromeShell";
import { TitleBar } from "@renderer/components/TitleBar";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "Renderer crashed"
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("renderer-error-boundary", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <WindowShell titleBar={<TitleBar activeTabLabel="Renderer Error" workspaceName={null} appVersion={null} />}>
        <ContentTabsShell rail={<div className="content-tab-rail-placeholder" />} panelClassName="is-error-shell">
          <div className="panel-empty app-error-boundary">
            <p>Renderer crashed.</p>
            <span>{this.state.message || "Check the renderer log for details."}</span>
          </div>
        </ContentTabsShell>
      </WindowShell>
    );
  }
}
