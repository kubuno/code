import { api } from '@kubuno/sdk'

const BASE = '/code'

// ── Projects ─────────────────────────────────────────────────────────────────

export interface Project {
  id:              string
  user_id:         string
  name:            string
  description:     string | null
  path:            string
  language:        string | null
  git_remote:      string | null
  files_folder_id: string | null
  last_opened_at:  string | null
  created_at:      string
  updated_at:      string
}

export interface CreateProjectDto {
  name:        string
  description?: string
  language?:   string
  git_clone?:  string
  storage?:    'local' | 'files'
  files_parent_folder_id?: string | null
}

export interface FileNode {
  name:     string
  path:     string
  is_dir:   boolean
  size:     number | null
  children: FileNode[] | null
}

export interface GitStatus {
  branch:    string
  ahead:     number
  behind:    number
  staged:    GitFileStatus[]
  unstaged:  GitFileStatus[]
  untracked: string[]
}

export interface GitFileStatus {
  path:   string
  status: string
}

export interface Extension {
  id:           string
  publisher:    string
  name:         string
  version:      string
  display_name: string | null
  description:  string | null
  is_enabled:   boolean
  installed_at: string
}

export interface ExtensionMarketEntry {
  publisher:    string
  name:         string
  version:      string
  display_name: string
  description:  string | null
  downloads:    number | null
}

export const codeApi = {
  // Projects
  listProjects:  () => api.get<Project[]>(`${BASE}/projects`).then(r => r.data),
  createProject: (dto: CreateProjectDto) => api.post<Project>(`${BASE}/projects`, dto).then(r => r.data),
  getProject:    (id: string) => api.get<Project>(`${BASE}/projects/${id}`).then(r => r.data),
  updateProject: (id: string, dto: Partial<CreateProjectDto>) =>
    api.patch<Project>(`${BASE}/projects/${id}`, dto).then(r => r.data),
  deleteProject: (id: string) => api.delete(`${BASE}/projects/${id}`),

  // File tree
  getTree: (projectId: string, path?: string) =>
    api.get<FileNode[]>(`${BASE}/projects/${projectId}/tree`, { params: path ? { path } : {} }).then(r => r.data),

  // File ops
  readFile:   (projectId: string, path: string) =>
    api.get<string>(`${BASE}/projects/${projectId}/files/${path}`, { responseType: 'text' }).then(r => r.data),
  writeFile:  (projectId: string, path: string, content: string) =>
    api.put(`${BASE}/projects/${projectId}/files/${path}`, { content }),
  deleteFile: (projectId: string, path: string) =>
    api.delete(`${BASE}/projects/${projectId}/files/${path}`),
  renameFile: (projectId: string, path: string, new_name: string) =>
    api.patch(`${BASE}/projects/${projectId}/rename/${path}`, { new_name }),
  mkdir:      (projectId: string, path: string) =>
    api.post(`${BASE}/projects/${projectId}/mkdir/${path}`),

  // Git
  gitStatus: (projectId: string) =>
    api.get<GitStatus>(`${BASE}/projects/${projectId}/git`).then(r => r.data),
  gitCommit: (projectId: string, message: string, files: string[] = []) =>
    api.post(`${BASE}/projects/${projectId}/git/commit`, { message, files }),
  gitInit:   (projectId: string) => api.post(`${BASE}/projects/${projectId}/git/init`),
  gitDiff:   (projectId: string, filePath: string) =>
    api.get<string>(`${BASE}/projects/${projectId}/git/diff/${filePath}`, { responseType: 'text' }).then(r => r.data),

  // Extensions
  listExtensions:     () => api.get<Extension[]>(`${BASE}/extensions`).then(r => r.data),
  searchMarket:       (q: string) =>
    api.get<ExtensionMarketEntry[]>(`${BASE}/extensions/market`, { params: { q } }).then(r => r.data),
  installExtension:   (publisher: string, name: string, version?: string) =>
    api.post<Extension>(`${BASE}/extensions`, { publisher, name, version }).then(r => r.data),
  uninstallExtension: (id: string) => api.delete(`${BASE}/extensions/${id}`),
  toggleExtension:    (id: string) =>
    api.post<Extension>(`${BASE}/extensions/${id}/toggle`).then(r => r.data),

  // Settings
  getSettings:    () => api.get<Record<string, unknown>>(`${BASE}/settings`).then(r => r.data),
  updateSettings: (s: Record<string, unknown>) => api.patch(`${BASE}/settings`, s),
}
