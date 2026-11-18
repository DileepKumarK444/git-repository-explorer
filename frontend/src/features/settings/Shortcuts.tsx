import { shortcuts } from '../../utils/shortcuts'

export function Shortcuts() {
  return (
    <div className="mx-auto max-w-[760px] px-[22px] py-[18px]">
      <h1 className="mb-1 text-[19px] font-semibold tracking-tight">Keyboard shortcuts</h1>
      <p className="mb-4 mt-0 text-mute">Shortcuts avoid browser defaults where they can. Customising keys is not supported yet.</p>
      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        {shortcuts.map((s) => (
          <div key={s.label} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
            <span className="min-w-0 flex-1">{s.label}<span className="ml-2 text-xs text-faint">{s.where}</span></span>
            <span className="flex gap-1">{s.keys.map((k) => <kbd key={k} className="rounded border border-line bg-panel2 px-1.5 py-0.5 font-mono text-xs text-mute">{k}</kbd>)}</span>
          </div>))}
      </div>
    </div>)
}
