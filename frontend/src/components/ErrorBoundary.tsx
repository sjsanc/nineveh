import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	children: ReactNode;
	fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("Render error caught by ErrorBoundary:", error, info);
	}

	reset = () => this.setState({ error: null });

	render() {
		const { error } = this.state;
		if (error) {
			if (this.props.fallback) return this.props.fallback(error, this.reset);
			return (
				<div className="p-4 m-4 text-sm text-red-300 bg-red-950/30 border border-red-900 rounded">
					<p className="font-medium mb-1">Something went wrong.</p>
					<p className="text-red-400/70 text-xs mb-3">{error.message}</p>
					<button
						type="button"
						onClick={this.reset}
						className="text-xs px-2 py-1 rounded bg-red-900/50 hover:bg-red-900 text-red-200 transition-colors"
					>
						Try again
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}
