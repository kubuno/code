import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { getDateLocale } from '@kubuno/sdk'
import { useConfirm } from '@kubuno/sdk'
import { ConfirmDialog } from '@ui'
import { Plus, Folder, Clock, GitBranch, Code2, Trash2, FolderOpen, HardDrive, Files } from 'lucide-react'
import { codeApi } from './api'
import { useCodeStore } from './store'
import type { CreateProjectDto, Project } from './api'
import CodeWorkbench from './CodeWorkbench'
import { filesService } from './filesService'
import { api } from '@kubuno/sdk'

export default function CodeApp() {
  const { activeProject, setActiveProject, openTab, setActiveTab } = useCodeStore()
  const [searchParams, setSearchParams] = useSearchParams()

  // Ouverture d'un fichier venant du module files via "Ouvrir avec…"
  useEffect(() => {
    const fileId   = searchParams.get('from_files_id')
    const fileName = searchParams.get('from_files_name')
    if (!fileId || !fileName) return

    // Nettoyer les params immédiatement pour éviter les re-triggers
    setSearchParams({}, { replace: true })

    const downloadUrl = filesService.downloadUrl(fileId)
    if (!downloadUrl) return

    const decodedName = decodeURIComponent(fileName)
    const language    = detectLanguageFromName(decodedName)
    const projectId   = `__files__${fileId}`

    // setActiveProject FIRST — it resets openTabs/activeTabPath in the store
    if (!activeProject) {
      setActiveProject({
        id:              projectId,
        user_id:         '',
        name:            decodedName,
        description:     null,
        path:            '',
        language,
        git_remote:      null,
        files_folder_id: null,
        last_opened_at:  null,
        created_at:      new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      })
    }

    api.get<string>(downloadUrl, { responseType: 'text' })
      .then(r => r.data)
      .then(content => {
        openTab({ projectId, path: fileId, name: decodedName, content, modified: false, language })
        setActiveTab(fileId)
      })
      .catch(() => { /* silencieux si le téléchargement échoue */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (activeProject) {
    return (
      <div className="h-full">
        <CodeWorkbench project={activeProject} />
      </div>
    )
  }

  return <ProjectList onOpen={setActiveProject} />
}

function detectLanguageFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    rs: 'rust', py: 'python', ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', go: 'go', c: 'c', cpp: 'cpp',
    h: 'c', java: 'java', kt: 'kotlin', sh: 'bash', yaml: 'yaml',
    yml: 'yaml', toml: 'toml', md: 'markdown', json: 'json',
    xml: 'xml', html: 'html', css: 'css', scss: 'scss', sql: 'sql',
  }
  return map[ext] ?? 'plaintext'
}

function ProjectList({ onOpen }: { onOpen: (p: Project) => void }) {
  const { t } = useTranslation('code')
  const queryClient = useQueryClient()
  const [showNew,         setShowNew]         = useState(false)
  const [newForm,         setNewForm]         = useState<CreateProjectDto>({ name: '', description: '' })
  const [selectedFolder,  setSelectedFolder]  = useState<{ id: string | null; name: string } | null>(null)
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm()

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['code-projects'],
    queryFn:  codeApi.listProjects,
  })

  const createMut = useMutation({
    mutationFn: codeApi.createProject,
    onSuccess:  (project) => {
      queryClient.invalidateQueries({ queryKey: ['code-projects'] })
      setShowNew(false)
      setNewForm({ name: '' })
      onOpen(project)
    },
  })

  const deleteMut = useMutation({
    mutationFn: codeApi.deleteProject,
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['code-projects'] }),
  })

  return (
    <div className="h-full bg-[#1e1e1e] text-[#cccccc] overflow-y-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Code2 size={32} className="text-[#007acc]" />
          <div>
            <h1 className="text-[22px] font-semibold">{t('code_app_title')}</h1>
            <p className="text-[13px] text-[#858585]">{t('code_app_subtitle')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {filesService.isAvailable() && (
            <button
              onClick={() => filesService.openFilePicker({ title: t('code_open_from_files') })}
              className="flex items-center gap-2 px-4 py-2 bg-[#3c3c3c] text-[#cccccc] rounded hover:bg-[#454545] text-[13px] border border-[#454545]"
            >
              <FolderOpen size={16} />
              {t('code_open_from_files')}
            </button>
          )}
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#007acc] text-white rounded hover:bg-[#005a9e] text-[13px]"
          >
            <Plus size={16} />
            {t('code_new_project')}
          </button>
        </div>
      </div>

      {/* New project form */}
      {showNew && (
        <div className="mb-6 bg-[#252526] rounded-lg p-5 border border-[#454545]">
          <h2 className="text-[15px] font-medium mb-4">{t('code_new_project')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] text-[#bbbbbe] mb-1">{t('code_field_name')}</label>
              <input
                className="w-full bg-[#3c3c3c] text-[13px] text-[#cccccc] rounded px-3 py-2 outline-none border border-transparent focus:border-[#007acc] placeholder:text-[#858585]"
                placeholder="mon-projet"
                value={newForm.name}
                onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && newForm.name && createMut.mutate(newForm)}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#bbbbbe] mb-1">{t('code_field_git_url')}</label>
              <input
                className="w-full bg-[#3c3c3c] text-[13px] text-[#cccccc] rounded px-3 py-2 outline-none border border-transparent focus:border-[#007acc] placeholder:text-[#858585]"
                placeholder="https://github.com/..."
                value={newForm.git_clone ?? ''}
                onChange={e => setNewForm(f => ({ ...f, git_clone: e.target.value || undefined }))}
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-[12px] text-[#bbbbbe] mb-1">{t('code_field_description')}</label>
            <input
              className="w-full bg-[#3c3c3c] text-[13px] text-[#cccccc] rounded px-3 py-2 outline-none border border-transparent focus:border-[#007acc] placeholder:text-[#858585]"
              placeholder={t('code_description_placeholder')}
              value={newForm.description ?? ''}
              onChange={e => setNewForm(f => ({ ...f, description: e.target.value || undefined }))}
            />
          </div>

          {/* Emplacement de stockage */}
          <div className="mt-4">
            <label className="block text-[12px] text-[#bbbbbe] mb-2">{t('code_storage_location')}</label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { setNewForm(f => ({ ...f, storage: 'local', files_parent_folder_id: undefined })); setSelectedFolder(null) }}
                className={`flex items-center gap-2 px-3 py-2 rounded text-[12px] border transition-colors ${
                  (newForm.storage ?? 'local') === 'local'
                    ? 'bg-[#007acc] border-[#007acc] text-white'
                    : 'bg-[#3c3c3c] border-[#454545] text-[#cccccc] hover:border-[#6a6a6a]'
                }`}
              >
                <HardDrive size={13} />
                {t('code_storage_local')}
              </button>
              {filesService.isAvailable() && (
                <button
                  type="button"
                  onClick={() => setNewForm(f => ({ ...f, storage: 'files' }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-[12px] border transition-colors ${
                    newForm.storage === 'files'
                      ? 'bg-[#007acc] border-[#007acc] text-white'
                      : 'bg-[#3c3c3c] border-[#454545] text-[#cccccc] hover:border-[#6a6a6a]'
                  }`}
                >
                  <Files size={13} />
                  {t('code_storage_files')}
                </button>
              )}
            </div>

            {newForm.storage === 'files' && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const result = await filesService.pickFolder({ title: t('code_pick_project_location') })
                    if (result !== undefined) {
                      setSelectedFolder(result)
                      setNewForm(f => ({ ...f, files_parent_folder_id: result?.id ?? null }))
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#3c3c3c] border border-[#6a6a6a] text-[#cccccc] rounded text-[12px] hover:border-[#007acc] transition-colors"
                >
                  <FolderOpen size={13} />
                  {selectedFolder ? t('code_in_folder', { name: selectedFolder.name }) : t('code_choose_folder')}
                </button>
                {selectedFolder && (
                  <button
                    type="button"
                    onClick={() => { setSelectedFolder(null); setNewForm(f => ({ ...f, files_parent_folder_id: null })) }}
                    className="text-[11px] text-[#858585] hover:text-[#cccccc]"
                  >
                    ✕ {t('code_root')}
                  </button>
                )}
                <span className="text-[11px] text-[#858585]">
                  {selectedFolder ? '' : t('code_default_root')}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => createMut.mutate(newForm)}
              disabled={!newForm.name.trim() || createMut.isPending}
              className="px-4 py-2 bg-[#007acc] text-white rounded text-[13px] hover:bg-[#005a9e] disabled:opacity-50"
            >
              {createMut.isPending ? t('code_creating') : newForm.git_clone ? t('code_clone_and_open') : t('code_create_and_open')}
            </button>
            <button
              onClick={() => { setShowNew(false); setNewForm({ name: '' }) }}
              className="px-4 py-2 bg-[#3c3c3c] text-[#cccccc] rounded text-[13px] hover:bg-[#454545]"
            >
              {t('common_cancel')}
            </button>
          </div>
          {createMut.isError && (
            <p className="mt-2 text-[12px] text-[#f48771]">
              {t('code_error', { message: (createMut.error as Error).message })}
            </p>
          )}
        </div>
      )}

      {/* Projects grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-[#252526] rounded-lg p-4 animate-pulse h-28" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Code2 size={48} className="text-[#3c3c3c] mb-4" />
          <p className="text-[15px] text-[#858585]">{t('code_no_projects')}</p>
          <p className="text-[13px] text-[#5a5a5a] mt-1">{t('code_no_projects_hint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={onOpen}
              onDelete={async (id) => {
                const ok = await confirm({
                  title:        t('code_delete_project_title', { name: p.name }),
                  message:      t('code_delete_project_message'),
                  confirmLabel: t('common_delete'),
                  variant:      'danger',
                })
                if (ok) deleteMut.mutate(id)
              }}
            />
          ))}
        </div>
      )}

      {confirmState && (
        <ConfirmDialog {...confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      )}
    </div>
  )
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project:  Project
  onOpen:   (p: Project) => void
  onDelete: (id: string) => void
}) {
  const { t, i18n } = useTranslation('code')
  const langColors: Record<string, string> = {
    rust:       '#de8f4f',
    python:     '#3572a5',
    typescript: '#2b7489',
    javascript: '#f0db4f',
    go:         '#00add8',
    cpp:        '#f34b7d',
    java:       '#b07219',
  }

  const langColor = project.language ? (langColors[project.language] ?? '#858585') : '#858585'

  return (
    <div
      className="group bg-[#252526] rounded-lg p-4 border border-[#3c3c3c] hover:border-[#007acc] cursor-pointer transition-colors relative"
      onClick={() => onOpen(project)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Folder size={20} className="text-[#c09553]" />
          <h3 className="text-[14px] font-medium text-[#cccccc] truncate max-w-[140px]">{project.name}</h3>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(project.id) }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#37373d] rounded text-[#858585] hover:text-red-400"
          title={t('common_delete')}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {project.description && (
        <p className="text-[12px] text-[#858585] mb-3 line-clamp-2">{project.description}</p>
      )}

      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2">
          {project.language && (
            <span
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${langColor}22`, color: langColor }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: langColor }} />
              {project.language}
            </span>
          )}
          {project.git_remote && (
            <span className="text-[#858585]" title={project.git_remote}>
              <GitBranch size={13} />
            </span>
          )}
        </div>

        {project.last_opened_at && (
          <span className="flex items-center gap-1 text-[11px] text-[#5a5a5a]">
            <Clock size={11} />
            {format(new Date(project.last_opened_at), 'd MMM', { locale: getDateLocale(i18n.language) })}
          </span>
        )}
      </div>
    </div>
  )
}
