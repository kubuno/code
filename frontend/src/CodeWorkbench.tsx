import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCodeStore } from './store'
import { codeApi } from './api'
import { ActivityBar } from './ActivityBar'
import { CodeSidebar } from './CodeSidebar'
import { EditorArea } from './EditorArea'
import { BottomPanel } from './BottomPanel'
import { StatusBar } from './StatusBar'
import { CommandPalette } from './CommandPalette'
import { CodeSettingsWindow } from './CodeSettingsWindow'
import type { Project } from './api'
import { Code2 } from 'lucide-react'
import { WorkspaceShell, WORKSPACE_DARK } from '@kubuno/sdk'

interface Props {
  project: Project
}

export default function CodeWorkbench({ project }: Props) {
  const { t }        = useTranslation('code')
  const store        = useCodeStore()
  const queryClient  = useQueryClient()
  const [editorPct,  setEditorPct]  = useState(65)
  const dragging     = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Projets ouverts depuis Files (id « __files__… ») = synthétiques : pas de
  // renommage / suppression serveur (le titre reste statique).
  const isSynthetic = project.id.startsWith('__files__')

  // ── Titre éditable (standard WorkspaceShell) — nom du projet ──────────────────
  const [titleDraft, setTitleDraft] = useState('')
  useEffect(() => { setTitleDraft(project.name) }, [project.name])
  const renameMut = useMutation({
    mutationFn: (name: string) => codeApi.updateProject(project.id, { name }),
    onSuccess: (p) => { store.setActiveProject(p); queryClient.invalidateQueries({ queryKey: ['code-projects'] }) },
  })
  const deleteMut = useMutation({
    mutationFn: () => codeApi.deleteProject(project.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['code-projects'] }); store.setActiveProject(null) },
  })
  const createMut = useMutation({
    mutationFn: () => codeApi.createProject({ name: t('code_new_project', { defaultValue: 'Nouveau projet' }) }),
    onSuccess: (p) => { queryClient.invalidateQueries({ queryKey: ['code-projects'] }); store.setActiveProject(p) },
  })
  const commitTitle = () => {
    const v = titleDraft.trim()
    if (v && v !== project.name) renameMut.mutate(v)
    else if (!v) setTitleDraft(project.name)
  }

  // Load file tree
  const { data: tree } = useQuery({
    queryKey: ['code-tree', project.id],
    queryFn:  () => codeApi.getTree(project.id),
  })

  useEffect(() => { if (tree) store.setFileTree(tree) }, [tree])

  // Load git status
  const { data: gitStatus } = useQuery({
    queryKey:        ['code-git', project.id],
    queryFn:         () => codeApi.gitStatus(project.id).catch(() => null),
    refetchInterval: 10_000,
  })

  useEffect(() => { store.setGitStatus(gitStatus ?? null) }, [gitStatus])

  // Save file mutation
  const saveMutation = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      codeApi.writeFile(project.id, path, content),
    onSuccess: (_, { path }) => {
      store.markTabModified(path, false)
      queryClient.invalidateQueries({ queryKey: ['code-git', project.id] })
    },
  })

  const handleSave = useCallback((path: string, content: string) => {
    saveMutation.mutate({ path, content })
  }, [saveMutation])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); store.toggleCommandPalette() }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); store.openSettings() }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        const tab = store.openTabs.find(t => t.path === store.activeTabPath)
        if (tab?.modified) handleSave(tab.path, tab.content)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); store.togglePanel() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [store, handleSave])

  // Panel resize drag
  const onDividerMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct  = ((e.clientY - rect.top) / rect.height) * 100
      setEditorPct(Math.max(20, Math.min(85, pct)))
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  return (
    <WorkspaceShell
      theme={WORKSPACE_DARK}
      chromeless
      topbarHeight={64}
      onBack={() => store.setActiveProject(null)}
      titleIcon={<Code2 size={16} style={{ color: WORKSPACE_DARK.accent }} className="flex-shrink-0" />}
      title={isSynthetic ? project.name : titleDraft}
      onTitleChange={isSynthetic ? undefined : setTitleDraft}
      onTitleCommit={isSynthetic ? undefined : commitTitle}
      titlePlaceholder={t('code_new_project', { defaultValue: 'Nouveau projet' })}
      onDelete={isSynthetic ? undefined : () => deleteMut.mutate()}
      deleteTitle={t('code_delete_project', { defaultValue: 'Supprimer le projet' })}
      deleteConfirm={{
        title: t('code_delete_confirm_title', { defaultValue: 'Supprimer ce projet ?' }),
        message: t('code_delete_confirm_msg', { defaultValue: 'Le projet et tous ses fichiers seront supprimés définitivement.' }),
        confirmLabel: t('common_delete', { defaultValue: 'Supprimer' }),
        variant: 'danger',
      }}
      menuActions={{
        newLabel: t('code_new_project', { defaultValue: 'Nouveau projet' }),
        onNew:    () => createMut.mutate(),
      }}
    >
    <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-[#1e1e1e] text-[#cccccc] font-mono text-sm overflow-hidden">
      {/* Activity Bar + Content */}
      <div className="flex flex-1 overflow-hidden min-h-0" ref={containerRef}>
        {/* Barre d'activité + explorateur masqués sur mobile (place à l'éditeur)
            et à l'impression. */}
        <div className="hidden sm:flex no-print"><ActivityBar /></div>
        <div className="hidden lg:flex no-print"><CodeSidebar project={project} /></div>

        {/* Editor + Panel */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div
            style={{ height: store.panelVisible ? `${editorPct}%` : '100%' }}
            className="overflow-hidden"
          >
            <EditorArea project={project} onSave={handleSave} />
          </div>

          {store.panelVisible && (
            <>
              <div
                className="h-1 bg-[#333] hover:bg-[#007acc] cursor-row-resize shrink-0 no-print"
                onMouseDown={onDividerMouseDown}
              />
              <div className="flex-1 overflow-hidden min-h-0">
                <BottomPanel project={project} />
              </div>
            </>
          )}
        </div>
      </div>

      <StatusBar project={project} />

      {store.commandPaletteOpen && (
        <CommandPalette project={project} onClose={() => store.toggleCommandPalette()} />
      )}

      {store.settingsOpen && <CodeSettingsWindow />}
    </div>
    </WorkspaceShell>
  )
}
