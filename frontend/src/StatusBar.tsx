import { GitBranch, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCodeStore } from './store'
import type { Project } from './api'

interface Props { project: Project }

export function StatusBar({ project }: Props) {
  const { t } = useTranslation('code')
  const { gitStatus, openTabs, activeTabPath } = useCodeStore()

  const activeTab = openTabs.find(t => t.path === activeTabPath)
  const changedCount = gitStatus
    ? gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length
    : 0

  return (
    <div className="flex items-center justify-between px-3 py-0.5 bg-[#007acc] text-white text-[12px] select-none shrink-0">
      {/* Left */}
      <div className="flex items-center gap-4">
        {gitStatus && (
          <div className="flex items-center gap-1.5">
            <GitBranch size={13} />
            <span>{gitStatus.branch}</span>
            {gitStatus.ahead > 0 && <span>↑{gitStatus.ahead}</span>}
            {gitStatus.behind > 0 && <span>↓{gitStatus.behind}</span>}
          </div>
        )}
        {changedCount > 0 && (
          <div className="flex items-center gap-1">
            <AlertCircle size={12} />
            <span>{t('code_status_changes', { count: changedCount })}</span>
          </div>
        )}
        {changedCount === 0 && gitStatus && (
          <div className="flex items-center gap-1 opacity-75">
            <CheckCircle2 size={12} />
            <span>{t('code_status_no_changes')}</span>
          </div>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-4 opacity-90">
        {activeTab && (
          <>
            <span>{activeTab.language}</span>
            <span>UTF-8</span>
            <span>LF</span>
          </>
        )}
        <span>{project.name}</span>
      </div>
    </div>
  )
}
