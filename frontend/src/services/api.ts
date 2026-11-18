import type { RecentRepo, RepoInfo } from '../types/repository'
import type { Insights, RefHit, SearchContent, Stash, StashFile, Tag, Blame, Branch, Changes, Commit, CommitDetail, CompareResult, DiffPair, FileContent, FileEntry, Overview } from '../types/explorer'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

async function call<T>(path: string, body?: unknown, signal?: AbortSignal, method = 'POST'): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, signal && body === undefined ? { signal } : body === undefined ? undefined : {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('Cannot reach the local backend. Is it running on port 8787?', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(typeof data.detail === 'string' ? data.detail : `Request failed (${res.status})`, res.status)
  return data as T
}

const qs = (p: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v))
  return u.toString()
}
const get = <T,>(path: string, p: Record<string, string | number | undefined | null>, signal?: AbortSignal) => call<T>(`${path}?${qs(p)}`, undefined, signal)

export const explorer = {
  overview: (repo: string) => get<Overview>('/api/overview', { repo }),
  files: (repo: string, ref?: string) => get<FileEntry[]>('/api/files', { repo, ref }),
  file: (repo: string, path: string, ref?: string) => get<FileContent>('/api/files/content', { repo, path, ref }),
  blame: (repo: string, path: string, ref?: string) => get<Blame>('/api/files/blame', { repo, path, ref }),
  branches: (repo: string) => get<Branch[]>('/api/branches', { repo }),
  commits: (repo: string, p: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    get<{ commits: Commit[]; has_more: boolean }>('/api/commits', { repo, ...p }, signal),
  changes: (repo: string) => get<Changes>('/api/changes', { repo }),
  diff: (repo: string, path: string, base: string, target: string, old_path?: string | null) =>
    get<DiffPair>('/api/diff', { repo, path, base, target, old_path }),
  compare: (repo: string, base: string, target: string, direct = false) =>
    get<CompareResult>('/api/compare', { repo, base, target, direct: direct ? 'true' : undefined }),
  searchContent: (repo: string, p: Record<string, string | number | undefined>, signal?: AbortSignal) => get<SearchContent>('/api/search/content', { repo, ...p }, signal),
  searchFiles: (repo: string, q: string) => get<string[]>('/api/search/files', { repo, q }),
  searchCommits: (repo: string, q: string) => get<Commit[]>('/api/search/commits', { repo, q }),
  searchRefs: (repo: string, q: string) => get<RefHit[]>('/api/search/refs', { repo, q }),
  tags: (repo: string) => get<Tag[]>('/api/tags', { repo }),
  stashes: (repo: string) => get<Stash[]>('/api/stashes', { repo }),
  stashFiles: (repo: string, i: number) => get<StashFile[]>(`/api/stashes/${i}/files`, { repo }),
  insights: (repo: string) => get<Insights>('/api/insights', { repo }),
  commit: (repo: string, rev: string) => get<CommitDetail>(`/api/commits/${encodeURIComponent(rev)}`, { repo }),
}

const op = <T = { ok: boolean }>(repo: string, name: string, body: unknown = {}) =>
  call<T>(`/api/ops/${name}?${qs({ repo })}`, body)

export const ops = {
  stage: (r: string, paths: string[]) => op(r, 'stage', { paths }),
  unstage: (r: string, paths: string[]) => op(r, 'unstage', { paths }),
  stageAll: (r: string) => op(r, 'stage-all'),
  unstageAll: (r: string) => op(r, 'unstage-all'),
  discard: (r: string, paths: string[], confirm: boolean) => op(r, 'discard', { paths, confirm }),
  commit: (r: string, message: string, description: string) => op<{ hash: string; short: string }>(r, 'commit', { message, description }),
  createBranch: (r: string, name: string, start: string | null, checkout: boolean) => op(r, 'branches/create', { name, start, checkout }),
  checkout: (r: string, name: string) => op<{ branch: string; created: boolean }>(r, 'branches/checkout', { name }),
  renameBranch: (r: string, old: string, name: string) => op(r, 'branches/rename', { old, new: name }),
  deleteBranch: (r: string, name: string, force: boolean) => op(r, 'branches/delete', { name, force }),
  createTag: (r: string, name: string, target: string | null, message: string | null) => op(r, 'tags/create', { name, target, message }),
  deleteTag: (r: string, name: string, confirm: boolean) => op(r, 'tags/delete', { name, confirm }),
  createStash: (r: string, message: string | null, include_untracked: boolean) => op(r, 'stashes/create', { message, include_untracked }),
  applyStash: (r: string, index: number) => op<{ message: string }>(r, 'stashes/apply', { index }),
  popStash: (r: string, index: number) => op<{ message: string }>(r, 'stashes/pop', { index }),
  dropStash: (r: string, index: number, confirm: boolean) => op(r, 'stashes/drop', { index, confirm }),
  fetch: (r: string) => op<{ message: string }>(r, 'fetch'),
  pull: (r: string) => op<{ message: string }>(r, 'pull'),
  push: (r: string) => op<{ message: string }>(r, 'push'),
}

export const settingsApi = {
  get: () => call<Record<string, unknown>>('/api/settings'),
  put: (patch: Record<string, unknown>) => call<Record<string, unknown>>('/api/settings', patch, undefined, 'PUT'),
}

export const api = {
  health: () => call<{ ok: boolean; git: string | null; error?: string }>('/api/health'),
  recent: () => call<RecentRepo[]>('/api/repositories'),
  validate: (path: string) => call<RepoInfo>('/api/repositories/validate', { path }),
  open: (path: string) => call<RepoInfo>('/api/repositories/open', { path }),
  favourite: (path: string, favourite: boolean) => call('/api/repositories/favourite', { path, favourite }),
  forget: (path: string) => call('/api/repositories/forget', { path }),
  pickFolder: () => call<{ path: string | null }>('/api/system/pick-folder', {}),
}
