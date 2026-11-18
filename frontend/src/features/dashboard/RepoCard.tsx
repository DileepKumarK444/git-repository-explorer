import { GitBranch, Star, X } from 'lucide-react'
import type { RecentRepo } from '../../types/repository'
import { timeAgo } from '../../utils/time'
import { cn } from '../../utils/cn'

interface Props { repo: RecentRepo; onOpen: () => void; onFavourite: () => void; onRemove: () => void }

export function RepoCard({ repo, onOpen, onFavourite, onRemove }: Props) {
  const dirty = repo.modified + repo.untracked
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      aria-label={`Open ${repo.name || repo.path}`}
      className={cn('flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-lg border border-line bg-panel px-3.5 py-3 hover:border-accent', repo.missing && 'opacity-70')}>
      <div className="flex items-center gap-2">
        <b className="min-w-0 flex-1 truncate text-sm">{repo.name || repo.path.split('/').pop()}</b>
        <button aria-label={repo.favourite ? 'Remove from favourites' : 'Add to favourites'} onClick={(e) => { e.stopPropagation(); onFavourite() }}
          className={cn('border-0 bg-transparent p-0.5', repo.favourite ? 'text-mod' : 'text-faint hover:text-fg')}>
          <Star size={14} fill={repo.favourite ? 'currentColor' : 'none'} />
        </button>
        <button aria-label="Remove from recent list" title="Remove from list (the folder is not touched)" onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="border-0 bg-transparent p-0.5 text-faint hover:text-fg"><X size={14} /></button>
      </div>
      <div className="truncate font-mono text-[11.5px] text-faint">{repo.path}</div>
      {repo.missing ? (
        <div className="text-del">{repo.error}</div>
      ) : (<>
        <div className="flex items-center gap-1 font-mono text-xs text-accent"><GitBranch size={12} />{repo.detached ? 'detached HEAD' : repo.branch}</div>
        <div className="truncate">{repo.has_commits ? repo.last_commit_message : <span className="text-mute">No commits yet</span>}</div>
        <div className="flex items-center gap-2.5 text-xs text-mute">
          <span>{timeAgo(repo.last_commit_date)}</span><span className="flex-1" />
          {repo.ahead ? <span className="rounded-full border border-line px-1.5 font-mono text-[11px]">↑{repo.ahead}</span> : null}
          {repo.behind ? <span className="rounded-full border border-line px-1.5 font-mono text-[11px]">↓{repo.behind}</span> : null}
          {dirty ? <span className="text-mod">{dirty} changed</span> : <span className="flex items-center gap-1.5"><i className="inline-block h-[7px] w-[7px] rounded-full bg-add" />clean</span>}
        </div>
      </>)}
    </div>
  )
}
