import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './styles/index.css'
import { AppShell } from './app/layout/AppShell'
import { Dashboard } from './features/dashboard/Dashboard'
import { lazy, Suspense } from 'react'
import { Settings } from './features/settings/Settings'
import { Shortcuts } from './features/settings/Shortcuts'
import { Overview } from './features/overview/Overview'
import { Branches } from './features/branches/Branches'
import { Commits } from './features/commits/Commits'
import { Changes } from './features/changes/Changes'
import { Compare } from './features/compare/Compare'
import { Search } from './features/search/Search'
import { Tags } from './features/tags/Tags'
import { Stashes } from './features/stashes/Stashes'
import { Insights } from './features/insights/Insights'
const Files = lazy(() => import('./features/files/Files').then((m) => ({ default: m.Files })))  // Monaco is large; load on demand

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="overview" element={<Overview />} />
          <Route path="files" element={<Suspense fallback={null}><Files /></Suspense>} />
          <Route path="commits" element={<Commits />} />
          <Route path="changes" element={<Changes />} />
          <Route path="compare" element={<Compare />} />
          <Route path="search" element={<Search />} />
          <Route path="tags" element={<Tags />} />
          <Route path="stashes" element={<Stashes />} />
          <Route path="insights" element={<Insights />} />
          <Route path="branches" element={<Branches />} />
          <Route path="settings" element={<Settings />} />
          <Route path="shortcuts" element={<Shortcuts />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
)
