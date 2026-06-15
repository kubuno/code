import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GitCommit, GitBranch, RefreshCw } from 'lucide-react'
import { useCodeStore } from './store'
import { codeApi } from './api'
import type { Project } from './api'

interface Props { project: Project }

export function GitPanel({ project }: Props) {
  const { t } = useTranslation('code')
  const { gitStatus } = useCodeStore()
  const [message, setMessage]   = useState('')
  const [staging, setStaging]   = useState<string[]>([])
  const queryClient             = useQueryClient()

  const commitMutation = useMutation({
    mutationFn: () => codeApi.gitCommit(project.id, message, staging),
    onSuccess:  () => {
      setMessage('')
      setStaging([])
      queryClient.invalidateQueries({ queryKey: ['code-git', project.id] })
    },
  })

  const initMutation = useMutation({
    mutationFn: () => codeApi.gitInit(project.id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['code-git', project.id] }),
  })

  if (!gitStatus) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbe]">
          {t('code_source_control')}
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-4 text-center">
          <p className="text-[12px] text-[#858585]">
            {t('code_not_a_git_repo')}
          </p>
          <button
            onClick={() => initMutation.mutate()}
            disabled={initMutation.isPending}
            className="px-3 py-1.5 bg-[#007acc] text-white text-[12px] rounded hover:bg-[#005a9e] disabled:opacity-50"
          >
            {t('code_init_repo')}
          </button>
        </div>
      </div>
    )
  }

  const allChanges = [
    ...gitStatus.staged.map(f => ({ ...f, zone: 'staged' as const })),
    ...gitStatus.unstaged.map(f => ({ ...f, zone: 'unstaged' as const })),
    ...gitStatus.untracked.map(p => ({ path: p, status: '?', zone: 'untracked' as const })),
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbe]">
        <div className="flex items-center gap-1.5">
          <GitBranch size={13} />
          <span>{gitStatus.branch}</span>
          {gitStatus.ahead > 0 && <span className="text-[#4ec9b0]">↑{gitStatus.ahead}</span>}
          {gitStatus.behind > 0 && <span className="text-[#f48771]">↓{gitStatus.behind}</span>}
        </div>
        <button
          title={t('code_refresh')}
          onClick={() => queryClient.invalidateQueries({ queryKey: ['code-git', project.id] })}
          className="p-1 hover:bg-[#37373d] rounded text-[#c5c5c5]"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Commit message */}
      <div className="px-2 pb-2">
        <textarea
          className="w-full bg-[#3c3c3c] text-[12px] text-[#cccccc] rounded p-2 outline-none resize-none placeholder:text-[#858585] border border-transparent focus:border-[#007acc]"
          rows={3}
          placeholder={t('code_commit_message_placeholder')}
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => {
            if (e.ctrlKey && e.key === 'Enter') {
              e.preventDefault()
              if (message.trim()) commitMutation.mutate()
            }
          }}
        />
        <button
          onClick={() => commitMutation.mutate()}
          disabled={!message.trim() || commitMutation.isPending}
          className="mt-1 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#007acc] text-white text-[12px] rounded hover:bg-[#005a9e] disabled:opacity-50"
        >
          <GitCommit size={13} />
          {t('code_commit')}
        </button>
      </div>

      {/* Changes list */}
      <div className="flex-1 overflow-y-auto text-[12px]">
        {allChanges.length === 0 ? (
          <div className="px-3 py-2 text-[#858585]">{t('code_no_changes')}</div>
        ) : (
          <>
            {gitStatus.staged.length > 0 && (
              <SectionHeader label={t('code_staged', { count: gitStatus.staged.length })} />
            )}
            {gitStatus.staged.map(f => (
              <ChangeItem key={f.path} path={f.path} status={f.status} />
            ))}

            {gitStatus.unstaged.length > 0 && (
              <SectionHeader label={t('code_changes', { count: gitStatus.unstaged.length })} />
            )}
            {gitStatus.unstaged.map(f => (
              <ChangeItem key={f.path} path={f.path} status={f.status} />
            ))}

            {gitStatus.untracked.length > 0 && (
              <SectionHeader label={t('code_untracked', { count: gitStatus.untracked.length })} />
            )}
            {gitStatus.untracked.map(p => (
              <ChangeItem key={p} path={p} status="?" />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-1 text-[11px] text-[#bbbbbe] uppercase font-semibold tracking-wider">
      {label}
    </div>
  )
}

function ChangeItem({ path, status }: { path: string; status: string }) {
  const color = status === 'A' ? 'text-[#4ec9b0]'
    : status === 'D' ? 'text-[#f48771]'
    : status === 'M' ? 'text-[#e2c08d]'
    : 'text-[#a8cc8c]'

  return (
    <div className="flex items-center gap-2 px-3 py-0.5 hover:bg-[#2a2d2e] cursor-default group">
      <span className={`font-bold w-3 ${color}`}>{status}</span>
      <span className="flex-1 truncate text-[#cccccc]">{path}</span>
    </div>
  )
}
