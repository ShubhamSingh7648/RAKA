import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled app error', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-dvh items-center justify-center bg-slate-950 px-6 text-slate-100">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <div className="text-2xl font-bold tracking-tight text-violet-300">Connecta</div>
            <p className="mt-3 text-sm text-slate-300">Something went wrong.</p>
            <p className="mt-1 text-xs text-slate-500">
              Please reload the app to continue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-md border border-violet-500/40 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100"
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
