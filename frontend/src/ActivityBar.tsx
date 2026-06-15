import { Files, Search, GitBranch, Puzzle, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCodeStore } from './store'
import clsx from 'clsx'


const PANELS = [
  { id: 'explorer',   Icon: Files,     titleKey: 'code_activity_explorer' },
  { id: 'search',     Icon: Search,    titleKey: 'code_activity_search' },
  { id: 'git',        Icon: GitBranch, titleKey: 'code_activity_git' },
  { id: 'extensions', Icon: Puzzle,    titleKey: 'code_activity_extensions' },
] as const

export function ActivityBar() {
  const { t } = useTranslation('code')
  const { sidebarPanel, setSidebarPanel, gitStatus, openSettings } = useCodeStore()

  const changedCount = gitStatus
    ? gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length
    : 0

  return (
    <div className="flex flex-col w-12 bg-[#333333] border-r border-[#252526] shrink-0">
      <div className="flex flex-col flex-1 items-center pt-2 gap-1">
        {PANELS.map(({ id, Icon, titleKey }) => (
          <button
            key={id}
            title={t(titleKey)}
            onClick={() => setSidebarPanel(id)}
            className={clsx(
              'relative w-10 h-10 flex items-center justify-center rounded transition-colors',
              sidebarPanel === id
                ? 'text-white bg-[#37373d]'
                : 'text-[#858585] hover:text-white hover:bg-[#2a2d2e]'
            )}
          >
            <Icon size={22} />
            {id === 'git' && changedCount > 0 && (
              <span className="absolute top-1 right-1 bg-[#007acc] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {changedCount > 99 ? '99+' : changedCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center pb-2">
        <button
          title={t('code_activity_settings')}
          onClick={openSettings}
          className="w-10 h-10 flex items-center justify-center rounded transition-colors text-[#858585] hover:text-white hover:bg-[#2a2d2e]"
        >
          <Settings size={22} />
        </button>
      </div>
    </div>
  )
}
