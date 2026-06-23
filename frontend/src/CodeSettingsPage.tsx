import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, ExternalLink } from 'lucide-react'
import { Toggle, Button, Radio } from '@ui'
import CodeLogo from './CodeLogo'
import { useModulePrefs } from './userPrefs'

// ── Per-user preferences (backend, cross-device via core users.preferences) ─────
//
// These mirror the most common Monaco editor options. They feed the editor by
// being merged on top of the module's own `code.user_settings` (see EditorArea).

export interface CodePrefs {
  theme:           string   // 'vs-dark' | 'vs' | 'hc-black'
  fontSize:        string   // '12' | '13' | '14' | '16' | '18'
  tabSize:         string   // '2' | '4' | '8'
  wordWrap:        boolean
  minimap:         boolean
  renderWhitespace: boolean
}

export const DEFAULT_PREFS: CodePrefs = {
  theme: 'vs-dark', fontSize: '14', tabSize: '2',
  wordWrap: false, minimap: true, renderWhitespace: false,
}

// ── Mail-style layout helpers ───────────────────────────────────────────────────

function SettingsRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-8 py-4 border-b border-[#e8eaed] last:border-0">
      <div className="w-60 flex-shrink-0">
        <p className="text-sm text-[#202124] font-normal">{label}</p>
        {description && <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function RadioGroup({ options, value, onChange }: {
  options: { value: string; label: string }[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      {options.map(opt => (
        <Radio key={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} label={opt.label} />
      ))}
    </div>
  )
}

// ── Préférences tab (per-user) ──────────────────────────────────────────────────

function PreferencesTab() {
  const { t } = useTranslation('code')
  const { prefs: saved, update } = useModulePrefs<CodePrefs>('code', DEFAULT_PREFS)
  const [prefs, setPrefs] = useState<CodePrefs>(saved)
  const [savedFlag, setSavedFlag] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof CodePrefs>(key: K, value: CodePrefs[K]) =>
    setPrefs(p => ({ ...p, [key]: value }))

  const save = async () => {
    setBusy(true)
    try {
      await update(prefs)
      setSavedFlag(true)
      setTimeout(() => setSavedFlag(false), 2500)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <SettingsRow
        label={t('code_pref_theme', { defaultValue: 'Thème de l\'éditeur' })}
        description={t('code_pref_theme_desc', { defaultValue: 'Couleurs de l\'éditeur de code.' })}
      >
        <RadioGroup
          value={prefs.theme}
          onChange={v => set('theme', v)}
          options={[
            { value: 'vs-dark',  label: t('code_pref_theme_dark',  { defaultValue: 'Sombre' }) },
            { value: 'vs',       label: t('code_pref_theme_light', { defaultValue: 'Clair' }) },
            { value: 'hc-black', label: t('code_pref_theme_hc',    { defaultValue: 'Contraste élevé' }) },
          ]}
        />
      </SettingsRow>

      <SettingsRow label={t('code_pref_font_size', { defaultValue: 'Taille de police' })}>
        <RadioGroup
          value={prefs.fontSize}
          onChange={v => set('fontSize', v)}
          options={['12', '13', '14', '16', '18'].map(n => ({
            value: n, label: t('code_pref_px', { defaultValue: '{{count}} px', count: Number(n) }),
          }))}
        />
      </SettingsRow>

      <SettingsRow
        label={t('code_pref_tab_size', { defaultValue: 'Largeur de tabulation' })}
        description={t('code_pref_tab_size_desc', { defaultValue: 'Nombre d\'espaces par niveau d\'indentation.' })}
      >
        <RadioGroup
          value={prefs.tabSize}
          onChange={v => set('tabSize', v)}
          options={['2', '4', '8'].map(n => ({
            value: n, label: t('code_pref_spaces', { defaultValue: '{{count}} espaces', count: Number(n) }),
          }))}
        />
      </SettingsRow>

      <SettingsRow label={t('code_pref_word_wrap', { defaultValue: 'Retour à la ligne automatique' })}>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Toggle checked={prefs.wordWrap} onChange={() => set('wordWrap', !prefs.wordWrap)} />
          <span className="text-sm text-text-primary">{t('code_pref_word_wrap_on', { defaultValue: 'Replier les lignes trop longues' })}</span>
        </label>
      </SettingsRow>

      <SettingsRow label={t('code_pref_minimap', { defaultValue: 'Minimap' })}>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Toggle checked={prefs.minimap} onChange={() => set('minimap', !prefs.minimap)} />
          <span className="text-sm text-text-primary">{t('code_pref_minimap_on', { defaultValue: 'Afficher l\'aperçu du fichier à droite' })}</span>
        </label>
      </SettingsRow>

      <SettingsRow label={t('code_pref_whitespace', { defaultValue: 'Espaces invisibles' })}>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Toggle checked={prefs.renderWhitespace} onChange={() => set('renderWhitespace', !prefs.renderWhitespace)} />
          <span className="text-sm text-text-primary">{t('code_pref_whitespace_on', { defaultValue: 'Afficher les espaces et tabulations' })}</span>
        </label>
      </SettingsRow>

      <div className="pt-5 flex items-center gap-3">
        <Button onClick={save} loading={busy}>
          {savedFlag
            ? <><Check size={14} className="mr-1.5 inline" />{t('code_settings_saved', { defaultValue: 'Enregistré' })}</>
            : t('code_settings_save_changes', { defaultValue: 'Enregistrer les modifications' })}
        </Button>
        <Button variant="ghost" onClick={() => setPrefs(saved)}>
          {t('common_cancel', { defaultValue: 'Annuler' })}
        </Button>
      </div>

      <p className="mt-6 text-xs text-text-tertiary leading-relaxed">
        {t('code_pref_advanced_hint', {
          defaultValue: 'Pour les réglages avancés de l\'éditeur (police, curseur, formatage…), ouvrez les paramètres dans l\'éditeur (icône ⚙ ou Ctrl+,).',
        })}
      </p>
    </div>
  )
}

// ── À propos tab ────────────────────────────────────────────────────────────────

function AboutTab() {
  const { t } = useTranslation('code')
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-surface-1">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <CodeLogo size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">Kubuno Code</p>
          <p className="text-xs text-text-tertiary">v0.1.0 · {t('code_official_module', { defaultValue: 'Module officiel' })}</p>
        </div>
        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Rust</span>
      </div>
      <div className="px-5 py-4">
        <a href="https://github.com/kubuno/code" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ExternalLink size={13} /> github.com/kubuno/code
        </a>
      </div>
    </div>
  )
}

// ── Main page (mail-style breadcrumb + tab bar) ─────────────────────────────────

type Tab = 'preferences' | 'about'

export default function CodeSettingsPage() {
  const { t } = useTranslation('code')
  const [tab, setTab] = useState<Tab>('preferences')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'preferences', label: t('code_tab_preferences', { defaultValue: 'Préférences' }) },
    { id: 'about',       label: t('code_tab_about',       { defaultValue: 'À propos' }) },
  ]

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-[#e8eaed] flex-shrink-0" style={{ background: '#f8f9fa' }}>
        <Link to="/code" className="flex items-center gap-1.5 text-sm text-[#1a73e8] hover:underline">
          <ArrowLeft size={14} />
          Code
        </Link>
        <span className="text-text-tertiary text-sm">/</span>
        <div className="flex items-center gap-1.5">
          <CodeLogo size={15} />
          <span className="text-sm text-text-primary">{t('code_settings_title_page', { defaultValue: 'Réglages' })}</span>
        </div>
      </div>

      {/* Tab bar (Gmail-style) */}
      <div className="flex items-end border-b border-[#e8eaed] px-4 flex-shrink-0 overflow-x-auto" style={{ background: '#fff' }}>
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`px-4 py-3 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === tb.id ? 'border-[#1a73e8] text-[#1a73e8] font-medium' : 'border-transparent text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4]'}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          {tab === 'preferences' && <PreferencesTab />}
          {tab === 'about'       && <AboutTab />}
        </div>
      </div>
    </div>
  )
}
