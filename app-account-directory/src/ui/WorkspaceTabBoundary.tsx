import { Component, type ReactNode } from "react";

type Props = { panel: string; children: ReactNode };
type State = { error: Error | null };

/**
 * Last-resort panel isolation. Relationship (and other tabs) must still render a designed
 * surface if a child throws — never a blank Account 360. Root causes should still be fixed.
 */
export class WorkspaceTabBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.panel !== this.props.panel && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ad-empty-state" role="alert">
        <p className="ad-kicker">{this.props.panel}</p>
        <h3>This panel could not be displayed</h3>
        <p className="muted">
          Account identity is still available in the header. Switch tabs or close and reopen this
          account. The underlying error was not swallowed silently.
        </p>
      </div>
    );
  }
}
