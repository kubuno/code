import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, ChevronRight, Settings2 } from 'lucide-react'
import { FloatingWindow } from '@ui'
import { codeApi } from './api'
import { Dropdown, Checkbox, RangeSlider } from '@ui'
import { useCodeStore } from './store'

// ── Types ─────────────────────────────────────────────────────────────────────

type SettingType = 'number' | 'text' | 'select' | 'checkbox' | 'range'

interface SelectOption { value: string; label: string }

interface SettingDef {
  key:         string
  label:       string
  description: string
  type:        SettingType
  default:     unknown
  options?:    SelectOption[]
  min?:        number
  max?:        number
}

interface Category {
  id:       string
  label:    string
  children?: Category[]
  settings?: SettingDef[]
}

// ── Catalogue des paramètres ─────────────────────────────────────────────────

// label/description hold i18n keys (resolved with t() at render time).
// Option labels that are pure code keywords stay literal; descriptive ones use i18n keys.
const S: Record<string, SettingDef> = {
  'editor.fontSize': {
    key: 'fontSize', label: 'code_set_fontSize_label', type: 'range',
    description: 'code_set_fontSize_desc',
    default: 14, min: 8, max: 32,
  },
  'editor.fontFamily': {
    key: 'fontFamily', label: 'code_set_fontFamily_label', type: 'text',
    description: 'code_set_fontFamily_desc',
    default: "'Cascadia Code', 'Fira Code', Consolas, monospace",
  },
  'editor.fontLigatures': {
    key: 'fontLigatures', label: 'code_set_fontLigatures_label', type: 'checkbox',
    description: 'code_set_fontLigatures_desc',
    default: true,
  },
  'editor.wordWrap': {
    key: 'wordWrap', label: 'code_set_wordWrap_label', type: 'select',
    description: 'code_set_wordWrap_desc',
    default: 'off',
    options: [
      { value: 'off',     label: 'code_opt_wordWrap_off' },
      { value: 'on',      label: 'code_opt_wordWrap_on' },
      { value: 'bounded', label: 'code_opt_wordWrap_bounded' },
    ],
  },
  'editor.tabSize': {
    key: 'tabSize', label: 'code_set_tabSize_label', type: 'range',
    description: 'code_set_tabSize_desc',
    default: 2, min: 1, max: 8,
  },
  'editor.insertSpaces': {
    key: 'insertSpaces', label: 'code_set_insertSpaces_label', type: 'checkbox',
    description: 'code_set_insertSpaces_desc',
    default: true,
  },
  'editor.detectIndentation': {
    key: 'detectIndentation', label: 'code_set_detectIndentation_label', type: 'checkbox',
    description: 'code_set_detectIndentation_desc',
    default: true,
  },
  'editor.formatOnSave': {
    key: 'formatOnSave', label: 'code_set_formatOnSave_label', type: 'checkbox',
    description: 'code_set_formatOnSave_desc',
    default: false,
  },
  'editor.formatOnType': {
    key: 'formatOnType', label: 'code_set_formatOnType_label', type: 'checkbox',
    description: 'code_set_formatOnType_desc',
    default: false,
  },
  'editor.lineNumbers': {
    key: 'lineNumbers', label: 'code_set_lineNumbers_label', type: 'select',
    description: 'code_set_lineNumbers_desc',
    default: 'on',
    options: [
      { value: 'on',       label: 'code_opt_lineNumbers_on' },
      { value: 'off',      label: 'code_opt_lineNumbers_off' },
      { value: 'relative', label: 'code_opt_lineNumbers_relative' },
    ],
  },
  'editor.minimap': {
    key: 'minimap', label: 'code_set_minimap_label', type: 'checkbox',
    description: 'code_set_minimap_desc',
    default: true,
  },
  'editor.smoothScrolling': {
    key: 'smoothScrolling', label: 'code_set_smoothScrolling_label', type: 'checkbox',
    description: 'code_set_smoothScrolling_desc',
    default: true,
  },
  'editor.scrollBeyondLastLine': {
    key: 'scrollBeyondLastLine', label: 'code_set_scrollBeyondLastLine_label', type: 'checkbox',
    description: 'code_set_scrollBeyondLastLine_desc',
    default: false,
  },
  'editor.renderWhitespace': {
    key: 'renderWhitespace', label: 'code_set_renderWhitespace_label', type: 'select',
    description: 'code_set_renderWhitespace_desc',
    default: 'selection',
    options: [
      { value: 'none',      label: 'code_opt_renderWhitespace_none' },
      { value: 'selection', label: 'code_opt_renderWhitespace_selection' },
      { value: 'trailing',  label: 'code_opt_renderWhitespace_trailing' },
      { value: 'all',       label: 'code_opt_renderWhitespace_all' },
    ],
  },
  'editor.bracketPairColorization': {
    key: 'bracketPairColorization', label: 'code_set_bracketPairColorization_label', type: 'checkbox',
    description: 'code_set_bracketPairColorization_desc',
    default: true,
  },
  'editor.guides.bracketPairs': {
    key: 'guidesBracketPairs', label: 'code_set_guidesBracketPairs_label', type: 'select',
    description: 'code_set_guidesBracketPairs_desc',
    default: 'true',
    options: [
      { value: 'true',   label: 'code_opt_guidesBracketPairs_true' },
      { value: 'active', label: 'code_opt_guidesBracketPairs_active' },
      { value: 'false',  label: 'code_opt_guidesBracketPairs_false' },
    ],
  },
  'editor.cursorBlinking': {
    key: 'cursorBlinking', label: 'code_set_cursorBlinking_label', type: 'select',
    description: 'code_set_cursorBlinking_desc',
    default: 'smooth',
    options: [
      { value: 'blink',  label: 'blink' },
      { value: 'smooth', label: 'smooth' },
      { value: 'phase',  label: 'phase' },
      { value: 'expand', label: 'expand' },
      { value: 'solid',  label: 'code_opt_cursorBlinking_solid' },
    ],
  },
  'editor.cursorStyle': {
    key: 'cursorStyle', label: 'code_set_cursorStyle_label', type: 'select',
    description: 'code_set_cursorStyle_desc',
    default: 'line',
    options: [
      { value: 'line',          label: 'code_opt_cursorStyle_line' },
      { value: 'block',         label: 'code_opt_cursorStyle_block' },
      { value: 'underline',     label: 'code_opt_cursorStyle_underline' },
      { value: 'line-thin',     label: 'code_opt_cursorStyle_lineThin' },
      { value: 'block-outline', label: 'code_opt_cursorStyle_blockOutline' },
    ],
  },
  'editor.cursorSmoothCaretAnimation': {
    key: 'cursorSmoothCaretAnimation', label: 'code_set_cursorSmoothCaretAnimation_label', type: 'select',
    description: 'code_set_cursorSmoothCaretAnimation_desc',
    default: 'on',
    options: [
      { value: 'off',      label: 'code_opt_caretAnim_off' },
      { value: 'explicit', label: 'code_opt_caretAnim_explicit' },
      { value: 'on',       label: 'code_opt_caretAnim_on' },
    ],
  },
  'workbench.colorTheme': {
    key: 'theme', label: 'code_set_colorTheme_label', type: 'select',
    description: 'code_set_colorTheme_desc',
    default: 'vs-dark',
    options: [
      { value: 'vs-dark',  label: 'Dark (VS Dark)' },
      { value: 'vs',       label: 'Light (VS Light)' },
      { value: 'hc-black', label: 'High Contrast Dark' },
    ],
  },
}

// Option labels that are pure code keywords (no translation needed).
const RAW_OPTION_LABELS = new Set(['blink', 'smooth', 'phase', 'expand', 'Dark (VS Dark)', 'Light (VS Light)', 'High Contrast Dark'])

// ── Arborescence de catégories ────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id: 'commonly-used', label: 'code_cat_commonly_used',
    settings: [
      'editor.fontSize', 'editor.fontFamily', 'editor.wordWrap', 'editor.tabSize',
      'editor.lineNumbers', 'editor.minimap', 'editor.formatOnSave', 'workbench.colorTheme',
    ].map(k => S[k]),
  },
  {
    id: 'text-editor', label: 'code_cat_text_editor',
    children: [
      {
        id: 'te-font', label: 'code_cat_font',
        settings: ['editor.fontSize', 'editor.fontFamily', 'editor.fontLigatures'].map(k => S[k]),
      },
      {
        id: 'te-display', label: 'code_cat_display',
        settings: [
          'editor.lineNumbers', 'editor.minimap', 'editor.wordWrap',
          'editor.renderWhitespace', 'editor.smoothScrolling',
          'editor.scrollBeyondLastLine', 'editor.bracketPairColorization', 'editor.guides.bracketPairs',
        ].map(k => S[k]),
      },
      {
        id: 'te-format', label: 'code_cat_formatting',
        settings: [
          'editor.tabSize', 'editor.insertSpaces',
          'editor.detectIndentation', 'editor.formatOnSave', 'editor.formatOnType',
        ].map(k => S[k]),
      },
      {
        id: 'te-cursor', label: 'code_cat_cursor',
        settings: [
          'editor.cursorBlinking', 'editor.cursorStyle', 'editor.cursorSmoothCaretAnimation',
        ].map(k => S[k]),
      },
    ],
  },
  {
    id: 'workbench', label: 'code_cat_workbench',
    settings: ['workbench.colorTheme'].map(k => S[k]),
  },
]

// ── Composant ligne de paramètre ─────────────────────────────────────────────

function SettingRow({
  def, value, onChange,
}: { def: SettingDef; value: unknown; onChange: (key: string, val: unknown) => void }) {
  const { t } = useTranslation('code')
  const current = value !== undefined ? value : def.default
  const optLabel = (l: string) => (RAW_OPTION_LABELS.has(l) ? l : t(l))

  const control = () => {
    switch (def.type) {
      case 'checkbox':
        return (
          <Checkbox
            variant="dark"
            checked={!!current}
            onChange={v => onChange(def.key, v)}
          />
        )
      case 'select':
        return (
          <Dropdown
            variant="dark"
            className="max-w-xs w-full"
            value={String(current)}
            onChange={v => onChange(def.key, v)}
            options={def.options?.map(o => ({ value: o.value, label: optLabel(o.label) })) ?? []}
          />
        )
      case 'range':
        // 'boxed' variant provides the editable numeric field, replacing the
        // previous separate number input.
        return (
          <div className="w-full max-w-xs">
            <RangeSlider
              variant="boxed"
              min={def.min} max={def.max} step={1}
              value={Number(current)}
              onChange={v => onChange(def.key, v)}
              accent="#007acc"
              trackColor="rgba(255,255,255,0.15)"
              aria-label={optLabel(def.label)}
            />
          </div>
        )
      default: // text
        return (
          <input
            type="text"
            value={String(current)}
            onChange={e => onChange(def.key, e.target.value)}
            className="bg-[#3c3c3c] text-[#cccccc] text-[12px] font-mono rounded px-2 py-1.5
                       border border-[#555] outline-none focus:border-[#007acc] w-full max-w-md"
          />
        )
    }
  }

  return (
    <div className="py-3 border-b border-[#2a2a2a] last:border-b-0">
      {def.type === 'checkbox' ? (
        <label className="flex items-start gap-3 cursor-pointer">
          {control()}
          <div>
            <div className="text-[12px] text-[#cccccc] font-medium leading-tight">{t(def.label)}</div>
            <div className="text-[11px] text-[#858585] mt-0.5 leading-snug">{t(def.description)}</div>
          </div>
        </label>
      ) : (
        <>
          <div className="text-[12px] text-[#cccccc] font-medium mb-0.5">{t(def.label)}</div>
          <div className="text-[11px] text-[#858585] mb-2 leading-snug">{t(def.description)}</div>
          {control()}
        </>
      )}
    </div>
  )
}

// ── Arbre nav gauche ──────────────────────────────────────────────────────────

function NavTree({
  categories, selected, onSelect, expanded, onToggle,
}: {
  categories: Category[]
  selected:   string
  onSelect:   (id: string) => void
  expanded:   Set<string>
  onToggle:   (id: string) => void
}) {
  const { t } = useTranslation('code')
  return (
    <ul className="py-1 text-[12px] select-none">
      {categories.map(cat => (
        <li key={cat.id}>
          <button
            onClick={() => cat.children ? onToggle(cat.id) : onSelect(cat.id)}
            className={`w-full text-left flex items-center gap-1 px-3 py-1.5 transition-colors
              ${selected === cat.id
                ? 'bg-[#094771] text-white'
                : 'text-[#b0b0b0] hover:bg-[#2a2d2e] hover:text-[#cccccc]'}`}
          >
            {cat.children
              ? <ChevronRight size={12} className={`shrink-0 transition-transform ${expanded.has(cat.id) ? 'rotate-90' : ''}`} />
              : <span className="w-3 shrink-0" />}
            <span className="truncate">{t(cat.label)}</span>
          </button>
          {cat.children && expanded.has(cat.id) && (
            <ul>
              {cat.children.map(child => (
                <li key={child.id}>
                  <button
                    onClick={() => onSelect(child.id)}
                    className={`w-full text-left pl-8 pr-3 py-1 transition-colors
                      ${selected === child.id
                        ? 'bg-[#094771] text-white'
                        : 'text-[#858585] hover:bg-[#2a2d2e] hover:text-[#b0b0b0]'}`}
                  >
                    {t(child.label)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

// ── Fenêtre principale ────────────────────────────────────────────────────────

export function CodeSettingsWindow() {
  const { t } = useTranslation('code')
  const { closeSettings } = useCodeStore()
  const queryClient       = useQueryClient()

  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState('commonly-used')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['text-editor']))

  const contentRef  = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // ── Chargement / sauvegarde ───────────────────────────────────────────────

  const { data } = useQuery({
    queryKey: ['code-settings'],
    queryFn:  codeApi.getSettings,
    staleTime: 60_000,
  })

  const [localValues, setLocalValues] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (data) setLocalValues(data as Record<string, unknown>)
  }, [data])

  const saveMut = useMutation({
    mutationFn:  codeApi.updateSettings,
    onSuccess:   () => queryClient.invalidateQueries({ queryKey: ['code-settings'] }),
  })

  const handleChange = useCallback((key: string, val: unknown) => {
    setLocalValues(prev => {
      const next = { ...prev, [key]: val }
      saveMut.mutate(next)
      return next
    })
  }, [saveMut])

  // ── Navigation ────────────────────────────────────────────────────────────

  const scrollToSection = useCallback((id: string) => {
    setSelected(id)
    const el = sectionRefs.current[id]
    if (el && contentRef.current) {
      contentRef.current.scrollTo({ top: el.offsetTop, behavior: 'smooth' })
    }
  }, [])

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Filtrage recherche ────────────────────────────────────────────────────

  const searchLower = search.trim().toLowerCase()
  const filteredDefs = searchLower
    ? Object.values(S).filter(
        d => t(d.label).toLowerCase().includes(searchLower) ||
             t(d.description).toLowerCase().includes(searchLower)
      )
    : null

  // ── Rendu d'une section ───────────────────────────────────────────────────

  const renderSection = (cat: Category) => (
    <div
      key={cat.id}
      ref={el => { sectionRefs.current[cat.id] = el }}
    >
      {/* Titre de section */}
      <div className="sticky top-0 bg-[#1e1e1e] z-10 border-b border-[#333] px-6 py-2">
        <h2 className="text-[12px] font-semibold text-[#cccccc] uppercase tracking-wider">
          {t(cat.label)}
        </h2>
      </div>

      {/* Paramètres directs */}
      {(cat.settings ?? []).length > 0 && (
        <div className="px-6">
          {(cat.settings ?? []).map(def => (
            <SettingRow key={def.key} def={def} value={localValues[def.key]} onChange={handleChange} />
          ))}
        </div>
      )}

      {/* Sous-catégories */}
      {(cat.children ?? []).map(child => (
        <div key={child.id} ref={el => { sectionRefs.current[child.id] = el }}>
          <h3 className="text-[11px] font-semibold text-[#858585] uppercase tracking-wider px-6 pt-4 pb-1">
            {t(child.label)}
          </h3>
          <div className="px-6">
            {(child.settings ?? []).map(def => (
              <SettingRow key={def.key} def={def} value={localValues[def.key]} onChange={handleChange} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <FloatingWindow
      title={t('code_settings_title')}
      icon={<Settings2 size={15} style={{ color: '#858585' }} />}
      onClose={closeSettings}
      defaultWidth={920}
      defaultHeight={640}
      minWidth={600}
      minHeight={400}
      resizable
    >
      {/* Fond sombre pour tout le contenu intérieur */}
      <div className="flex flex-col flex-1 min-h-0 bg-[#1e1e1e] overflow-hidden">

        {/* Barre de recherche */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#252526] border-b border-[#333] shrink-0">
          <Search size={13} className="text-[#858585] shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder={t('code_settings_search_placeholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[13px] text-[#cccccc] outline-none placeholder:text-[#606060]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[#858585] hover:text-[#cccccc] text-xs">✕</button>
          )}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Arbre de navigation */}
          {!filteredDefs && (
            <div className="w-52 shrink-0 bg-[#252526] overflow-y-auto border-r border-[#333]">
              <NavTree
                categories={CATEGORIES}
                selected={selected}
                onSelect={scrollToSection}
                expanded={expanded}
                onToggle={toggleExpanded}
              />
            </div>
          )}

          {/* Zone de contenu */}
          <div ref={contentRef} className="flex-1 overflow-y-auto">
            {filteredDefs ? (
              <div className="px-6 py-4">
                {filteredDefs.length === 0
                  ? <p className="text-[12px] text-[#858585]">{t('code_no_settings_match', { search })}</p>
                  : filteredDefs.map(def => (
                      <SettingRow key={def.key} def={def} value={localValues[def.key]} onChange={handleChange} />
                    ))
                }
              </div>
            ) : (
              <>
                {CATEGORIES.map(renderSection)}
                <div className="h-16" />
              </>
            )}
          </div>
        </div>
      </div>
    </FloatingWindow>
  )
}
