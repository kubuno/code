import { useCodeStore } from './store'
import { ExplorerPanel } from './ExplorerPanel'
import { SearchPanel } from './SearchPanel'
import { GitPanel } from './GitPanel'
import { ExtensionsPanel } from './ExtensionsPanel'
import type { Project } from './api'

interface Props {
  project: Project
}

export function CodeSidebar({ project }: Props) {
  const { sidebarPanel } = useCodeStore()

  return (
    <div className="w-64 bg-[#252526] border-r border-[#1e1e1e] flex flex-col overflow-hidden shrink-0">
      {sidebarPanel === 'explorer'   && <ExplorerPanel project={project} />}
      {sidebarPanel === 'search'     && <SearchPanel project={project} />}
      {sidebarPanel === 'git'        && <GitPanel project={project} />}
      {sidebarPanel === 'extensions' && <ExtensionsPanel />}
    </div>
  )
}
