import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Download, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { codeApi } from './api'
import type { ExtensionMarketEntry } from './api'

export function ExtensionsPanel() {
  const { t } = useTranslation('code')
  const [query,       setQuery]       = useState('')
  const [searchMode,  setSearchMode]  = useState(false)
  const queryClient = useQueryClient()

  const { data: installed = [] } = useQuery({
    queryKey: ['code-extensions'],
    queryFn:  codeApi.listExtensions,
  })

  const { data: market = [], isLoading: searching } = useQuery({
    queryKey: ['code-market', query],
    queryFn:  () => codeApi.searchMarket(query),
    enabled:  searchMode && query.length > 1,
  })

  const installMut = useMutation({
    mutationFn: (e: ExtensionMarketEntry) =>
      codeApi.installExtension(e.publisher, e.name, e.version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['code-extensions'] }),
  })

  const uninstallMut = useMutation({
    mutationFn: codeApi.uninstallExtension,
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['code-extensions'] }),
  })

  const toggleMut = useMutation({
    mutationFn: codeApi.toggleExtension,
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['code-extensions'] }),
  })

  const installedIds = new Set(installed.map(e => `${e.publisher}.${e.name}`))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbe]">
        {t('code_extensions')}
      </div>

      <div className="px-2 pb-2">
        <div className="flex items-center bg-[#3c3c3c] rounded px-2 py-1 gap-2">
          <Search size={14} className="text-[#858585] shrink-0" />
          <input
            className="flex-1 bg-transparent text-[13px] text-[#cccccc] outline-none placeholder:text-[#858585]"
            placeholder={t('code_search_extensions')}
            value={query}
            onChange={e => { setQuery(e.target.value); setSearchMode(true) }}
            onKeyDown={e => e.key === 'Escape' && setSearchMode(false)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto text-[12px]">
        {searchMode && query.length > 1 ? (
          <>
            {searching && <div className="px-3 text-[#858585]">{t('code_searching')}</div>}
            {market.map(ext => {
              const id = `${ext.publisher}.${ext.name}`
              const alreadyInstalled = installedIds.has(id)
              return (
                <div key={id} className="px-3 py-2 hover:bg-[#2a2d2e] cursor-default">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[#cccccc] font-medium truncate">{ext.display_name}</div>
                      <div className="text-[#858585] text-[11px] truncate">{ext.publisher}</div>
                      {ext.description && (
                        <div className="text-[#858585] text-[11px] line-clamp-2 mt-0.5">{ext.description}</div>
                      )}
                    </div>
                    {!alreadyInstalled && (
                      <button
                        onClick={() => installMut.mutate(ext)}
                        disabled={installMut.isPending}
                        title={t('code_install')}
                        className="shrink-0 p-1 hover:bg-[#37373d] rounded text-[#4ec9b0]"
                      >
                        <Download size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        ) : (
          <>
            <div className="px-3 py-1 text-[11px] text-[#bbbbbe] uppercase font-semibold tracking-wider">
              {t('code_installed', { count: installed.length })}
            </div>
            {installed.map(ext => (
              <div key={ext.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#2a2d2e]">
                <div className="flex-1 min-w-0">
                  <div className={`truncate ${ext.is_enabled ? 'text-[#cccccc]' : 'text-[#858585] line-through'}`}>
                    {ext.display_name ?? ext.name}
                  </div>
                  <div className="text-[#858585] text-[11px]">{ext.publisher} • v{ext.version}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => toggleMut.mutate(ext.id)}
                    title={ext.is_enabled ? t('code_disable') : t('code_enable')}
                    className="p-1 hover:bg-[#37373d] rounded text-[#858585] hover:text-[#cccccc]"
                  >
                    {ext.is_enabled ? <ToggleRight size={14} className="text-[#007acc]" /> : <ToggleLeft size={14} />}
                  </button>
                  <button
                    onClick={() => uninstallMut.mutate(ext.id)}
                    title={t('code_uninstall')}
                    className="p-1 hover:bg-[#37373d] rounded text-[#858585] hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
