import { Component, type ReactNode } from 'react'

/** Keeps one broken screen from blanking the whole app. Reset by changing `resetKey` (the route). */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey }
  static getDerivedStateFromError(error: Error) { return { error } }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { key: string; error: Error | null }) {
    return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="m-6 max-w-[620px] rounded-lg border border-del bg-del-bg p-4 text-del">
        <b>This screen hit an unexpected error.</b>
        <p className="my-2 font-mono text-xs">{this.state.error.message}</p>
        <p className="mb-3 mt-0 text-xs">Your repository was not changed by this. Reload the screen, or go to another one from the sidebar.</p>
        <button onClick={() => this.setState({ error: null })} className="h-7 rounded-[5px] border border-del bg-transparent px-3 text-del">Try again</button>
      </div>)
  }
}
