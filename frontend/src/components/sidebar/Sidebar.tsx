import { NavLink } from 'react-router-dom'
import { Boxes, GitBranch, GitCommitHorizontal, FolderTree, GitCompare, LayoutDashboard, PanelLeft, Plus, Search, Settings, Tag, Archive, BarChart3, Info, Keyboard, type LucideIcon } from 'lucide-react'
import { useApp } from '../../store/app'
import { cn } from '../../utils/cn'

interface Item { to: string; label: string; icon: LucideIcon }
const workspace: Item[] = [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }]
const repoNav: Item[] = [
  { to: '/overview', label: 'Overview', icon: Info }, { to: '/files', label: 'Files', icon: FolderTree },
  { to: '/commits', label: 'Commits', icon: GitCommitHorizontal }, { to: '/branches', label: 'Branches', icon: GitBranch },
  { to: '/changes', label: 'Changes', icon: Plus }, { to: '/compare', label: 'Compare', icon: GitCompare },
]
const tools: Item[] = [
  { to: '/search', label: 'Search', icon: Search }, { to: '/tags', label: 'Tags', icon: Tag },
  { to: '/stashes', label: 'Stashes', icon: Archive }, { to: '/insights', label: 'Insights', icon: BarChart3 },
]

function Link({ item, collapsed }: { item: Item; collapsed: boolean }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.to === '/'} title={item.label}
      className={({ isActive }) => cn('flex items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-mute no-underline hover:bg-panel2 hover:text-fg',
        collapsed && 'justify-center', isActive && 'bg-accent-soft font-medium text-accent hover:bg-accent-soft hover:text-accent')}>
      <Icon size={15} strokeWidth={1.7} className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  )
}
const Heading = ({ children, collapsed }: { children: string; collapsed: boolean }) =>
  collapsed ? <div className="h-3" /> : <h6 className="mx-2 mb-1 mt-4 text-[10.5px] font-semibold uppercase tracking-[.08em] text-faint">{children}</h6>

export function Sidebar() {
  const { repo, collapsed, toggleSidebar } = useApp()
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-line bg-panel">
      {repo && !collapsed ? (
        <div className="m-2.5 flex min-w-0 flex-col gap-0.5 rounded-md border border-line bg-panel2 px-2.5 py-2" data-testid="repo-chip">
          <b className="truncate font-semibold">{repo.name}</b>
          <span className="flex items-center gap-1 font-mono text-xs text-accent">
            <GitBranch size={12} />{repo.detached ? 'detached HEAD' : repo.branch}
          </span>
        </div>
      ) : !collapsed && <div className="m-2.5 flex items-center gap-2 px-1 text-mute"><Boxes size={16} /> <span className="font-medium text-fg">Git Repository Explorer</span></div>}
      <nav className="flex-1 overflow-auto px-2 py-1">
        <Heading collapsed={collapsed}>Workspace</Heading>
        {workspace.map((i) => <Link key={i.to} item={i} collapsed={collapsed} />)}
        {repo && <>
          <Heading collapsed={collapsed}>Repository</Heading>
          {repoNav.map((i) => <Link key={i.to} item={i} collapsed={collapsed} />)}
          <Heading collapsed={collapsed}>Tools</Heading>
          {tools.map((i) => <Link key={i.to} item={i} collapsed={collapsed} />)}
        </>}
      </nav>
      <div className="flex flex-col gap-0.5 border-t border-line p-2">
        <Link item={{ to: '/settings', label: 'Settings', icon: Settings }} collapsed={collapsed} />
        <Link item={{ to: '/shortcuts', label: 'Shortcuts', icon: Keyboard }} collapsed={collapsed} />
        <button onClick={toggleSidebar} title="Toggle sidebar (Ctrl/Cmd+B)"
          className={cn('flex items-center gap-2.5 rounded-[5px] border-0 bg-transparent px-2 py-1.5 text-mute hover:bg-panel2', collapsed && 'justify-center')}>
          <PanelLeft size={15} strokeWidth={1.7} />{!collapsed && <span>Collapse</span>}
        </button>
        {!collapsed && <div className="px-2 py-1 text-[11px] text-faint">v0.1.0</div>}
      </div>
    </aside>
  )
}
