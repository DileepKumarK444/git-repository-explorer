import type { RepoInfo } from './repository'

export interface Ref { name: string; type: 'head' | 'branch' | 'remote' | 'tag' }
export interface Commit { hash: string; short: string; parents: string[]; author: string; email: string; date: string; refs: Ref[]; subject: string }
export interface CommitFile { path: string; old_path: string | null; status: string; insertions: number | null; deletions: number | null }
export interface CommitDetail extends Commit { message: string; files: CommitFile[]; insertions: number; deletions: number }
export interface Branch {
  name: string; remote: boolean; current: boolean; hash: string; full_hash: string; upstream: string | null
  upstream_gone: boolean; ahead: number; behind: number; author: string; date: string; subject: string
}
export interface FileEntry { path: string; status: '' | 'M' | 'A' | 'D' | 'R' | 'U' }
export interface FileContent { path: string; name?: string; size: number; binary: boolean; too_large: boolean; content: string }
export interface BlameCommit { hash: string; author?: string; time?: number; summary?: string; uncommitted: boolean }
export interface Blame { commits: Record<string, BlameCommit>; lines: string[] }
export interface Overview extends RepoInfo {
  branches: number; tags: number; recent: Commit[]
  changes: { M: number; A: number; D: number; R: number; U: number; staged: number }
}

export interface ChangeFile { path: string; old_path: string | null; status: 'M' | 'A' | 'D' | 'R' | 'U'; insertions: number | null; deletions: number | null; conflict?: boolean }
export interface Changes { staged: ChangeFile[]; unstaged: ChangeFile[] }
export interface DiffPair { path: string; binary: boolean; too_large: boolean; size?: number; original: string; modified: string; added?: boolean; deleted?: boolean }
export interface CompareResult {
  base: string; target: string; diff_base: string; merge_base: string | null; worktree: boolean
  files: ChangeFile[]; insertions: number; deletions: number; ahead: number; behind: number
  commits_ahead: Commit[]; commits_behind: Commit[]
}

export interface SearchLine { line: number; text: string; match: boolean; ranges: [number, number][] }
export interface SearchContent { files: { path: string; lines: SearchLine[] }[]; total: number; truncated: boolean }
export interface RefHit { name: string; kind: 'branch' | 'remote' | 'tag'; hash: string }
export interface Tag { name: string; annotated: boolean; commit: string; short: string; date: string; tagger: string | null; message: string | null }
export interface Stash { index: number; ref: string; hash: string; branch: string | null; message: string; date: string }
export interface StashFile { path: string; old_path: string | null; status: 'M' | 'A' | 'D' | 'R'; untracked: boolean }
export interface Insights {
  empty: boolean; commits: number; branches: number; tags: number; files: number; size_kib: number
  contributors: { name: string; email: string; commits: number }[]
  activity: { week: string; commits: number; files: number }[]
  top_files: { path: string; changes: number }[]; top_dirs: { path: string; changes: number }[]
  scanned: number; scan_limited: boolean
}
