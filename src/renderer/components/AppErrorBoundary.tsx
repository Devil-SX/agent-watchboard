import { Component, type ErrorInfo, type ReactNode } from "react";

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
      <div className="window-shell">
        <TitleBar activeTabLabel="Renderer Error" workspaceName={null} appVersion={null} />
        <main className="app-shell">
          <div className="content-tabs-shell">
            <div className="content-tab-rail" />
            <div className="content-tab-panel">
              <div className="panel-empty app-error-boundary">
                <p>Renderer crashed.</p>
                <span>{this.state.message || "Check the renderer log for details."}</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }
}
