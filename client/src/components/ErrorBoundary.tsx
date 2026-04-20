import { Component, ErrorInfo, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

/**
 * Vangt render-crashes op. Voorkomt dat één component de hele app sloopt —
 * toont een brutalism-stijl foutkaart met een "opnieuw"-knop.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh flex items-center justify-center p-6">
          <div className="brut-card bg-hot text-paper p-5 max-w-md w-full">
            <h2 className="font-display text-3xl uppercase">Oeps 🥩</h2>
            <p className="mt-2 font-bold">Er ging iets mis in de UI.</p>
            <pre className="text-xs mt-3 bg-paper text-ink p-2 border-2 border-ink
                            whitespace-pre-wrap break-words max-h-48 overflow-auto">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={this.reset}
                className="brut-btn bg-pop text-ink flex-1"
              >
                opnieuw
              </button>
              <button
                type="button"
                onClick={() => location.reload()}
                className="brut-btn bg-paper text-ink"
              >
                reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
