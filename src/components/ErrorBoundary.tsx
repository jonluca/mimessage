import React from "react";

interface ErrorBoundaryProps extends React.PropsWithChildren {
  variant?: "app" | "section";
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(errorInfo);
    console.error(error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.variant === "section") {
        return (
          <div className="section-error" role="alert">
            <span className="section-error-icon" aria-hidden="true">
              !
            </span>
            <div>
              <p className="section-error-title">This section couldn’t be loaded.</p>
              <p className="section-error-description">The rest of your message summary is still available.</p>
            </div>
          </div>
        );
      }

      return (
        <main className="app-error-shell">
          <section
            aria-describedby="app-error-description"
            aria-labelledby="app-error-title"
            className="app-error-content"
            role="alert"
          >
            <span className="app-error-icon" aria-hidden="true">
              !
            </span>
            <div className="app-error-copy">
              <h1 className="messages-modal-title" id="app-error-title">
                Mimessage encountered a problem
              </h1>
              <p className="messages-modal-subtitle" id="app-error-description">
                Reload the app to restore the Messages view. Your message history and settings will not be changed.
              </p>
              <div className="app-error-actions">
                <button autoFocus className="messages-modal-button--primary" type="button" onClick={this.handleReload}>
                  Reload Mimessage
                </button>
              </div>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
