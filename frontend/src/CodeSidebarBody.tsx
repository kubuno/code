import { useQuery } from '@tanstack/react-query'
import { Folder } from 'lucide-react'
import { codeApi } from './api'
import { useCodeStore } from './store'
import { SidebarNavItem } from '@kubuno/sdk'
import { codeTo } from './codeRoute'

export default function CodeSidebarBody({ collapsed = false }: { collapsed?: boolean }) {
  const { activeProject, setActiveProject } = useCodeStore()

  const { data: projects = [] } = useQuery({
    queryKey: ['code-projects'],
    queryFn:  codeApi.listProjects,
  })

  return (
    // Same container metrics as the core shell's sidebar nav (12px inset, 2px
    // between rows), so a code row lines up with a mail or chat row.
    <div className={`flex flex-col gap-0.5 py-1 px-2`}>
      {projects.map(p => (
        <SidebarNavItem
          key={p.id}
          collapsed={collapsed}
          label={p.name}
          icon={<Folder size={15} className="text-[#c09553] shrink-0" />}
          active={activeProject?.id === p.id}
          // Real link carrying the project: /code?project=<id>. CodeApp reads
          // it back, so the row is shareable and the Back button works.
          to={codeTo(p.id)}
          onClick={() => setActiveProject(p)}
        />
      ))}
    </div>
  )
}
