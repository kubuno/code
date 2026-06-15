import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCodeStore } from './store'
import { codeApi } from './api'
import type { Project } from './api'
import { Search } from 'lucide-react'

interface Props {
  project: Project
  onClose: () => void
}

interface Command {
  label:   string
  detail?: string
  action:  () => void
}

export function CommandPalette({ project, onClose }: Props) {
  const { t } = useTranslation('code')
  const [query,    setQuery]    = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { openTabs } = useCodeStore()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const fileCommands: Command[] = openTabs.map(tab => ({
    label:  tab.name,
    detail: tab.path,
    action: () => {
      useCodeStore.getState().setActiveTab(tab.path)
      onClose()
    },
  }))

  const builtinCommands: Command[] = [
    {
      label:  t('code_cmd_git_init'),
      action: () => { codeApi.gitInit(project.id); onClose() },
    },
  ]

  const allCommands = query.startsWith('>')
    ? builtinCommands.filter(c => c.label.toLowerCase().includes(query.slice(1).toLowerCase().trim()))
    : fileCommands.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        (c.detail?.toLowerCase().includes(query.toLowerCase()) ?? false)
      )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, allCommands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      allCommands[selected]?.action()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      <div
        className="w-[600px] bg-[#252526] rounded-lg shadow-2xl overflow-hidden border border-[#454545]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#333]">
          <Search size={16} className="text-[#858585] shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-[14px] text-[#cccccc] outline-none placeholder:text-[#858585]"
            placeholder={t('code_palette_placeholder')}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={handleKeyDown}
          />
          <span className="text-[11px] text-[#858585]">{t('code_palette_esc_hint')}</span>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {allCommands.length === 0 && (
            <div className="px-4 py-3 text-[13px] text-[#858585]">
              {query ? t('code_palette_no_results') : t('code_palette_no_open_files')}
            </div>
          )}
          {allCommands.map((cmd, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-4 py-2 cursor-pointer text-[13px] ${
                i === selected ? 'bg-[#007acc] text-white' : 'text-[#cccccc] hover:bg-[#2a2d2e]'
              }`}
              onClick={cmd.action}
            >
              <span>{cmd.label}</span>
              {cmd.detail && (
                <span className={`text-[11px] ml-4 truncate max-w-xs ${i === selected ? 'text-white/70' : 'text-[#858585]'}`}>
                  {cmd.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
