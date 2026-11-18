import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { RepoCard } from './RepoCard'
import { OpenRepository } from './OpenRepository'
import { Sidebar } from '../../components/sidebar/Sidebar'
import { useApp } from '../../store/app'
import type { RecentRepo } from '../../types/repository'

const base: RecentRepo = {
  valid: true, path: '/dev/orbit', name: 'orbit', root: '/dev/orbit', branch: 'main', detached: false, has_commits: true,
  last_commit_hash: 'abc', last_commit_message: 'Add limiter', last_commit_date: null, last_commit_author: 'A',
  modified: 2, untracked: 1, ahead: 1, behind: 0, upstream: 'origin/main', error: null, favourite: false, opened_at: 0, missing: false,
}

test('card shows branch, message and change count', () => {
  render(<RepoCard repo={base} onOpen={() => {}} onFavourite={() => {}} onRemove={() => {}} />)
  expect(screen.getByText('main')).toBeInTheDocument()
  expect(screen.getByText('Add limiter')).toBeInTheDocument()
  expect(screen.getByText('3 changed')).toBeInTheDocument()
})

test('favourite and remove do not open the repository', () => {
  const open = vi.fn(), fav = vi.fn(), rm = vi.fn()
  render(<RepoCard repo={base} onOpen={open} onFavourite={fav} onRemove={rm} />)
  fireEvent.click(screen.getByLabelText('Add to favourites'))
  fireEvent.click(screen.getByLabelText('Remove from recent list'))
  expect(fav).toHaveBeenCalled(); expect(rm).toHaveBeenCalled(); expect(open).not.toHaveBeenCalled()
})

test('missing repository shows its error', () => {
  render(<RepoCard repo={{ ...base, missing: true, error: "'/dev/orbit' does not exist." }} onOpen={() => {}} onFavourite={() => {}} onRemove={() => {}} />)
  expect(screen.getByText(/does not exist/)).toBeInTheDocument()
})

test('empty path is rejected before calling the backend', async () => {
  const onOpen = vi.fn()
  render(<OpenRepository onOpen={onOpen} />)
  fireEvent.click(screen.getByText('Open'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a folder path first.')
  expect(onOpen).not.toHaveBeenCalled()
})

test('backend validation message is shown', async () => {
  const onOpen = vi.fn().mockResolvedValue("'x' is not a Git repository")
  render(<OpenRepository onOpen={onOpen} />)
  fireEvent.change(screen.getByLabelText('Repository path'), { target: { value: '/tmp/x' } })
  fireEvent.click(screen.getByText('Open'))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not a Git repository'))
})

test('sidebar shows repository navigation only when a repo is open', () => {
  useApp.setState({ repo: null })
  const { rerender } = render(<MemoryRouter><Sidebar /></MemoryRouter>)
  expect(screen.queryByText('Commits')).not.toBeInTheDocument()
  useApp.setState({ repo: base })
  rerender(<MemoryRouter><Sidebar /></MemoryRouter>)
  expect(screen.getByText('Commits')).toBeInTheDocument()
  expect(screen.getByTestId('repo-chip')).toHaveTextContent('main')
})
