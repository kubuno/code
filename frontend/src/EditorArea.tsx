import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import { X } from 'lucide-react'
import { useCodeStore } from './store'
import { codeApi } from './api'
import type { Project } from './api'
import { useModulePrefs } from './userPrefs'
import { DEFAULT_PREFS, type CodePrefs } from './CodeSettingsPage'
import clsx from 'clsx'
import type { editor } from 'monaco-editor'

interface Props {
  project: Project
  onSave:  (path: string, content: string) => void
}

export function EditorArea({ onSave: _onSave }: Props) {
  const { t } = useTranslation('code')
  const { openTabs, activeTabPath, closeTab, setActiveTab, updateTabContent } = useCodeStore()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const { data: userSettings } = useQuery({
    queryKey: ['code-settings'],
    queryFn:  codeApi.getSettings,
    staleTime: 60_000,
  })
  const baseSettings = (userSettings ?? {}) as {
    fontSize?: number; tabSize?: number; wordWrap?: string; theme?: string
    fontFamily?: string; fontLigatures?: boolean; minimap?: boolean; lineNumbers?: string
    insertSpaces?: boolean; detectIndentation?: boolean; formatOnSave?: boolean
    formatOnType?: boolean; smoothScrolling?: boolean; scrollBeyondLastLine?: boolean
    renderWhitespace?: string; bracketPairColorization?: boolean; guidesBracketPairs?: string
    cursorBlinking?: string; cursorStyle?: string; cursorSmoothCaretAnimation?: string
  }

  // Per-user preferences (core users.preferences) override the module-level
  // editor settings for the handful of options exposed on the settings page.
  const { prefs } = useModulePrefs<CodePrefs>('code', DEFAULT_PREFS)
  const settings = {
    ...baseSettings,
    theme:            prefs.theme,
    fontSize:         Number(prefs.fontSize),
    tabSize:          Number(prefs.tabSize),
    wordWrap:         prefs.wordWrap ? 'on' : 'off',
    minimap:          prefs.minimap,
    renderWhitespace: prefs.renderWhitespace ? 'all' : (baseSettings.renderWhitespace ?? 'selection'),
  }

  const activeTab = openTabs.find(t => t.path === activeTabPath)

  if (openTabs.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-[#858585] select-none">
        <div className="text-[48px] mb-4">⌨️</div>
        <p className="text-[14px]">{t('code_editor_empty_open_file')}</p>
        <p className="text-[12px] mt-1 text-[#5a5a5a]">{t('code_editor_empty_palette_hint')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center bg-[#2d2d2d] overflow-x-auto shrink-0 scrollbar-none">
        {openTabs.map(tab => (
          <div
            key={tab.path}
            onClick={() => setActiveTab(tab.path)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 cursor-pointer shrink-0 border-r border-[#1e1e1e] text-[13px] whitespace-nowrap group',
              tab.path === activeTabPath
                ? 'bg-[#1e1e1e] text-[#cccccc] border-t-2 border-t-[#007acc]'
                : 'text-[#858585] hover:bg-[#252526]',
            )}
          >
            <span>{tab.name}</span>
            {tab.modified && <span className="w-2 h-2 rounded-full bg-[#cccccc] shrink-0" />}
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(tab.path) }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#37373d] text-[#858585] hover:text-white"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Breadcrumb */}
      {activeTab && (
        <div className="px-4 py-0.5 text-[11px] text-[#858585] bg-[#1e1e1e] border-b border-[#333] shrink-0">
          {activeTab.path.replace(/\//g, ' › ')}
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <Editor
            key={activeTab.path}
            height="100%"
            language={activeTab.language}
            value={activeTab.content}
            theme={(settings.theme as 'vs-dark' | 'vs' | 'hc-black') ?? 'vs-dark'}
            options={{
              fontSize:            settings.fontSize  ?? 14,
              fontFamily:          settings.fontFamily ?? "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
              fontLigatures:       settings.fontLigatures ?? true,
              minimap:             { enabled: settings.minimap ?? true },
              scrollBeyondLastLine: settings.scrollBeyondLastLine ?? false,
              wordWrap:            (settings.wordWrap as 'off' | 'on' | 'wordWrapColumn' | 'bounded') ?? 'off',
              lineNumbers:         (settings.lineNumbers as 'on' | 'off' | 'relative') ?? 'on',
              renderWhitespace:    (settings.renderWhitespace as 'none' | 'selection' | 'trailing' | 'all') ?? 'selection',
              bracketPairColorization: { enabled: settings.bracketPairColorization ?? true },
              guides:              { bracketPairs: (settings.guidesBracketPairs === 'active' ? 'active' : settings.guidesBracketPairs !== 'false') as boolean | 'active' },
              smoothScrolling:     settings.smoothScrolling ?? true,
              cursorBlinking:      (settings.cursorBlinking as 'blink' | 'smooth' | 'phase' | 'expand' | 'solid') ?? 'smooth',
              cursorStyle:         (settings.cursorStyle as 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline') ?? 'line',
              cursorSmoothCaretAnimation: (settings.cursorSmoothCaretAnimation as 'off' | 'explicit' | 'on') ?? 'on',
              tabSize:             settings.tabSize   ?? 2,
              insertSpaces:        settings.insertSpaces ?? true,
              detectIndentation:   settings.detectIndentation ?? true,
              padding:             { top: 8 },
            }}
            onChange={(value) => {
              if (value !== undefined) updateTabContent(activeTab.path, value)
            }}
            onMount={(monacoEditor) => {
              editorRef.current = monacoEditor
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[#858585]">
            {t('code_editor_select_tab')}
          </div>
        )}
      </div>
    </div>
  )
}
