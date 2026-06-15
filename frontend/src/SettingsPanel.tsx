import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { codeApi } from './api'
import { Dropdown } from '@ui'

interface EditorSettings {
  fontSize?:    number
  tabSize?:     number
  wordWrap?:    'off' | 'on' | 'wordWrapColumn' | 'bounded'
  theme?:       'vs-dark' | 'vs' | 'hc-black'
  fontFamily?:  string
  minimap?:     boolean
  lineNumbers?: 'on' | 'off' | 'relative'
}

const DEFAULTS: Required<EditorSettings> = {
  fontSize:    14,
  tabSize:     2,
  wordWrap:    'off',
  theme:       'vs-dark',
  fontFamily:  "'Cascadia Code', 'Fira Code', monospace",
  minimap:     true,
  lineNumbers: 'on',
}

export function SettingsPanel() {
  const { t } = useTranslation('code')
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['code-settings'],
    queryFn:  codeApi.getSettings,
  })

  const [local, setLocal] = useState<EditorSettings>({})

  useEffect(() => {
    if (data) setLocal(data as EditorSettings)
  }, [data])

  const saveMut = useMutation({
    mutationFn:  codeApi.updateSettings,
    onSuccess:   () => queryClient.invalidateQueries({ queryKey: ['code-settings'] }),
  })

  const update = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    const next = { ...local, [key]: value }
    setLocal(next)
    saveMut.mutate(next as Record<string, unknown>)
  }

  const s = { ...DEFAULTS, ...local }

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center text-[#858585] text-[12px]">
      {t('common_loading')}
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbe] shrink-0">
        {t('code_editor_settings')}
      </div>

      <div className="px-3 space-y-4 pb-4">

        {/* Theme */}
        <div>
          <label className="block text-[11px] text-[#bbbbbe] mb-1">{t('code_theme')}</label>
          <Dropdown
            variant="dark"
            className="w-full"
            value={s.theme}
            onChange={v => update('theme', v as EditorSettings['theme'])}
            options={[
              { value: 'vs-dark',  label: t('code_theme_dark') },
              { value: 'vs',       label: t('code_theme_light') },
              { value: 'hc-black', label: t('code_theme_high_contrast') },
            ]}
          />
        </div>

        {/* Font size */}
        <div>
          <label className="block text-[11px] text-[#bbbbbe] mb-1">
            {t('code_font_size')} <span className="text-[#cccccc]">{s.fontSize}px</span>
          </label>
          <input
            type="range" min={10} max={24} step={1}
            value={s.fontSize}
            onChange={e => update('fontSize', Number(e.target.value))}
            className="w-full accent-[#007acc]"
          />
        </div>

        {/* Tab size */}
        <div>
          <label className="block text-[11px] text-[#bbbbbe] mb-1">{t('code_tab_size')}</label>
          <Dropdown
            variant="dark"
            className="w-full"
            value={String(s.tabSize)}
            onChange={v => update('tabSize', Number(v))}
            options={[2, 4, 8].map(n => ({ value: String(n), label: t('code_n_spaces', { count: n }) }))}
          />
        </div>

        {/* Word wrap */}
        <div>
          <label className="block text-[11px] text-[#bbbbbe] mb-1">{t('code_word_wrap')}</label>
          <Dropdown
            variant="dark"
            className="w-full"
            value={s.wordWrap}
            onChange={v => update('wordWrap', v as EditorSettings['wordWrap'])}
            options={[
              { value: 'off',     label: t('code_word_wrap_off') },
              { value: 'on',      label: t('code_word_wrap_on') },
              { value: 'bounded', label: t('code_word_wrap_bounded') },
            ]}
          />
        </div>

        {/* Line numbers */}
        <div>
          <label className="block text-[11px] text-[#bbbbbe] mb-1">{t('code_line_numbers')}</label>
          <Dropdown
            variant="dark"
            className="w-full"
            value={s.lineNumbers}
            onChange={v => update('lineNumbers', v as EditorSettings['lineNumbers'])}
            options={[
              { value: 'on',       label: t('code_line_numbers_show') },
              { value: 'off',      label: t('code_line_numbers_hide') },
              { value: 'relative', label: t('code_line_numbers_relative') },
            ]}
          />
        </div>

        {/* Minimap */}
        <div className="flex items-center justify-between">
          <label className="text-[11px] text-[#bbbbbe]">{t('code_minimap')}</label>
          <button
            onClick={() => update('minimap', !s.minimap)}
            className={`w-10 h-5 rounded-full transition-colors relative ${s.minimap ? 'bg-[#007acc]' : 'bg-[#555]'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${s.minimap ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Font family */}
        <div>
          <label className="block text-[11px] text-[#bbbbbe] mb-1">{t('code_font_family')}</label>
          <input
            type="text"
            value={s.fontFamily}
            onChange={e => update('fontFamily', e.target.value)}
            onBlur={e => update('fontFamily', e.target.value)}
            className="w-full bg-[#3c3c3c] text-[12px] text-[#cccccc] rounded px-2 py-1.5 outline-none border border-[#555] focus:border-[#007acc] font-mono"
          />
        </div>

        {saveMut.isError && (
          <p className="text-[11px] text-red-400">
            {t('code_save_error')}
          </p>
        )}
      </div>
    </div>
  )
}
