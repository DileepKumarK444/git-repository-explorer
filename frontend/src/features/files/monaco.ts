import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import { loader } from '@monaco-editor/react'

// Bundle Monaco locally so the app works offline (no CDN fetch).
self.MonacoEnvironment = { getWorker: () => new editorWorker() }
loader.config({ monaco })

export function languageFor(path: string): string {
  const name = path.split('/').pop() ?? path
  const lower = name.toLowerCase()
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile'
  const ext = lower.includes('.') ? '.' + lower.split('.').pop() : ''
  const hit = monaco.languages.getLanguages().find((l) => l.extensions?.includes(ext) || l.filenames?.includes(name))
  return hit?.id ?? 'plaintext'
}
export { monaco }
