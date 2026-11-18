export interface RepoInfo {
  valid: boolean
  path: string
  name: string
  root: string
  branch: string | null
  detached: boolean
  has_commits: boolean
  last_commit_hash: string | null
  last_commit_message: string | null
  last_commit_date: string | null
  last_commit_author: string | null
  modified: number
  untracked: number
  ahead: number | null
  behind: number | null
  upstream: string | null
  error: string | null
}
export interface RecentRepo extends RepoInfo { favourite: boolean; opened_at: number; missing: boolean }
