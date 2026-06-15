import { useQuery } from '@tanstack/react-query'
import { Folder } from 'lucide-react'
import { codeApi } from './api'
import { useCodeStore } from './store'
import { useNavigate } from 'react-router-dom'
import { SidebarNavItem } from '@kubuno/sdk'

export default function CodeSidebarBody({ collapsed = false }: { collapsed?: boolean }) {
  const navigate   = useNavigate()
  const { activeProject, setActiveProject } = useCodeStore()

  const { data: projects = [] } = useQuery({
    queryKey: ['code-projects'],
    queryFn:  codeApi.listProjects,
  })

  return (
    <div className={`flex flex-col gap-0.5 py-1 ${collapsed ? 'px-2' : ''}`}>
      {projects.map(p => (
        <SidebarNavItem
          key={p.id}
          collapsed={collapsed}
          label={p.name}
          icon={<Folder size={15} className="text-[#c09553] shrink-0" />}
          active={activeProject?.id === p.id}
          onClick={() => { setActiveProject(p); navigate('/code') }}
        />
      ))}
    </div>
  )
}
