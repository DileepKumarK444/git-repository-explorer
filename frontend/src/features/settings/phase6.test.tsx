import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../../services/api', async (orig) => {
  const real = await orig<typeof import('../../services/api')>()
  return { ...real, settingsApi: { get: vi.fn(), put: vi.fn() }, explorer: { ...real.explorer, branches: vi.fn().mockResolvedValue([]), searchFiles: vi.fn().mockResolvedValue([]) } }
})
import { settingsApi } from '../../services/api'
import { CommandPalette } from '../../components/command-palette/CommandPalette'
import { useContextMenu } from '../../components/ui/ContextMenu'
import { ErrorBoundary } from '../../components/ui/ErrorBoundary'
import { defaults, useSettings } from '../../store/settings'
import { useApp } from '../../store/app'
import { Settings } from './Settings'
import { Shortcuts } from './Shortcuts'

beforeEach(() => {
  useSettings.setState({ s: { ...defaults }, loaded: true, resolved: 'dark' })
  useApp.setState({ repo: null })
  vi.mocked(settingsApi.put).mockImplementation(async (patch) => ({ ...defaults, ...patch }))
})

test('palette filters commands, and Escape closes it', () => {
  const onClose = vi.fn()
  render(<MemoryRouter><CommandPalette open onClose={onClose} /></MemoryRouter>)
  expect(screen.getByText('Open repository')).toBeInTheDocument()
  expect(screen.queryByText('View commits')).not.toBeInTheDocument()      // repo-only commands are hidden without a repo
  fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'sett' } })
  expect(screen.getByText('Open settings')).toBeInTheDocument()
  expect(screen.queryByText('Open repository')).not.toBeInTheDocument()
  fireEvent.keyDown(screen.getByLabelText('Command'), { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})

test('palette shows nothing found message', () => {
  render(<MemoryRouter><CommandPalette open onClose={() => {}} /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'zzzzqq' } })
  expect(screen.getByText('No matching command.')).toBeInTheDocument()
})

function Host({ onPick }: { onPick: () => void }) {
  const { open, menu } = useContextMenu()
  return <div><button onContextMenu={(e) => open(e, [{ label: 'Do it', onClick: onPick }, { label: 'Nope', onClick: () => {}, disabled: true }])}>row</button>{menu}</div>
}

test('context menu opens on right click, runs an item, then closes', () => {
  const pick = vi.fn()
  render(<Host onPick={pick} />)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.contextMenu(screen.getByText('row'))
  expect(screen.getByRole('menuitem', { name: 'Nope' })).toBeDisabled()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Do it' }))
  expect(pick).toHaveBeenCalled(); expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('context menu closes on Escape', () => {
  render(<Host onPick={() => {}} />)
  fireEvent.contextMenu(screen.getByText('row')); fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

function Boom({ on }: { on: boolean }) { if (on) throw new Error('kaput'); return <p>fine</p> }

test('error boundary shows the message and recovers when the route changes', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { rerender } = render(<ErrorBoundary resetKey="/a"><Boom on /></ErrorBoundary>)
  expect(screen.getByRole('alert')).toHaveTextContent('kaput')
  rerender(<ErrorBoundary resetKey="/b"><Boom on={false} /></ErrorBoundary>)
  expect(screen.getByText('fine')).toBeInTheDocument()
})

test('settings: changing a value saves it, and a rejected value is reverted with the reason', async () => {
  render(<MemoryRouter><Settings /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Light' }))
  await waitFor(() => expect(settingsApi.put).toHaveBeenCalledWith({ theme: 'light' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Saved')

  vi.mocked(settingsApi.put).mockRejectedValueOnce(new Error("'/nope' was not found."))
  const git = screen.getByLabelText('Git executable path')
  fireEvent.change(git, { target: { value: '/nope' } }); fireEvent.blur(git)
  expect(await screen.findByRole('alert')).toHaveTextContent('was not found')
  await waitFor(() => expect(useSettings.getState().s.git_path).toBe(''))
})

test('settings: confirmation toggle is on by default and can be turned off', async () => {
  render(<MemoryRouter><Settings /></MemoryRouter>)
  const box = screen.getByLabelText('Confirm destructive operations') as HTMLInputElement
  expect(box.checked).toBe(true)
  fireEvent.click(box)
  await waitFor(() => expect(settingsApi.put).toHaveBeenCalledWith({ confirm_destructive: false }))
})

test('shortcuts page lists the palette shortcut', () => {
  render(<Shortcuts />)
  expect(screen.getByText(/Command palette: run a command/)).toBeInTheDocument()
})
