import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Code2, Folder } from 'lucide-react'
import { codeApi } from './api'
import { useCodeStore } from './store'
import { useNavigate } from 'react-router-dom'

export default function CodeRecentWidget() {
  const { t } = useTranslation('code')
  const navigate     = useNavigate()
  const setProject   = useCodeStore(s => s.setActiveProject)

  const { data: projects = [] } = useQuery({
    queryKey: ['code-projects'],
    queryFn:  codeApi.listProjects,
  })

  const recent = projects.slice(0, 3)

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Code2 size={16} className="text-[#007acc]" />
        <span className="text-sm font-medium text-text-primary">Code</span>
      </div>

      {recent.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-text-tertiary">
          {t('code_recent_empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 flex-1">
          {recent.map(p => (
            <button
              key={p.id}
              onClick={() => { setProject(p); navigate('/code') }}
              className="flex items-center gap-2 text-left hover:bg-surface-2 rounded px-2 py-1.5 transition-colors"
            >
              <Folder size={14} className="text-[#c09553] shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-primary truncate">{p.name}</div>
                {p.language && (
                  <div className="text-[11px] text-text-tertiary">{p.language}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
