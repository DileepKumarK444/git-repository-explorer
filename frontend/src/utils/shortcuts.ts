export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? '⌘' : 'Ctrl'
export const shortcuts: { keys: string[]; label: string; where: string }[] = [
  { keys: [MOD, 'K'], label: 'Command palette: run a command, switch branch, open a file', where: 'Anywhere' },
  { keys: [MOD, 'O'], label: 'Open repository (go to the dashboard)', where: 'Anywhere' },
  { keys: [MOD, 'Shift', 'F'], label: 'Search the repository', where: 'Anywhere' },
  { keys: [MOD, 'R'], label: 'Refresh repository data', where: 'Anywhere' },
  { keys: [MOD, 'B'], label: 'Show or hide the sidebar', where: 'Anywhere' },
  { keys: [MOD, 'Enter'], label: 'Commit staged files', where: 'Changes' },
  { keys: [MOD, 'F'], label: 'Find inside the open file or diff', where: 'Files, diffs' },
  { keys: ['Esc'], label: 'Close the palette, a dialog or a menu', where: 'Anywhere' },
  { keys: ['↑', '↓', 'Enter'], label: 'Move through and run palette results', where: 'Command palette' },
]
