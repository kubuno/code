import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import type { Project } from './api'
import { codeApi } from './api'
import { useCodeStore } from './store'
import { getLanguageFromPath } from './utils'

interface Props { project: Project }

interface SearchResult {
  file:    string
  line:    number
  content: string
}

export function SearchPanel({ project }: Props) {
  const { t } = useTranslation('code')
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const { openTab } = useCodeStore()

  const doSearch = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    // Server-side search not implemented → client-side grep over open files hint
    // For now, display a placeholder
    setResults([{ file: '', line: 0, content: t('code_search_server_unavailable') }])
    setLoading(false)
  }, [query, t])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbe]">
        {t('code_search_title')}
      </div>

      <div className="px-2 pb-2">
        <div className="flex items-center bg-[#3c3c3c] rounded px-2 py-1 gap-2">
          <Search size={14} className="text-[#858585] shrink-0" />
          <input
            className="flex-1 bg-transparent text-[13px] text-[#cccccc] outline-none placeholder:text-[#858585]"
            placeholder={t('code_search_placeholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 text-[12px]">
        {loading && <div className="text-[#858585] py-2">{t('code_search_searching')}</div>}
        {results.map((r, i) => (
          <div
            key={i}
            className="py-1 cursor-pointer hover:bg-[#2a2d2e] rounded px-1"
            onClick={() => r.file && codeApi.readFile(project.id, r.file).then(content =>
              openTab({ projectId: project.id, path: r.file, name: r.file.split('/').pop() ?? r.file, content, modified: false, language: getLanguageFromPath(r.file) })
            )}
          >
            {r.file && <div className="text-[#007acc] truncate">{r.file}:{r.line}</div>}
            <div className="text-[#858585] truncate">{r.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
