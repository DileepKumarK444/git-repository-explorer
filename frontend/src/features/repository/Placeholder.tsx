import { RequireRepo } from './RequireRepo'

/** Screens that are designed but not built yet. Says so plainly. */
export function Placeholder({ title, phase, summary, needsRepo = true }: { title: string; phase: number; summary: string; needsRepo?: boolean }) {
  const body = (
    <div className="grid h-full place-items-center p-8 text-center text-mute">
      <div className="max-w-[420px]">
        <h1 className="mb-1 text-[19px] font-semibold text-fg">{title}</h1>
        <p>{summary}</p>
        <p className="text-faint">Planned for Phase {phase}. Not built yet.</p>
      </div>
    </div>
  )
  return needsRepo ? <RequireRepo>{() => body}</RequireRepo> : body
}
