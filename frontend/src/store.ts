import { create } from 'zustand'
import type { FileNode, GitStatus, Project } from './api'

export interface OpenTab {
  projectId: string
  path:      string
  name:      string
  content:   string
  modified:  boolean
  language:  string
}

interface CodeState {
  projects:        Project[]
  activeProject:   Project | null
  fileTree:        FileNode[]
  openTabs:        OpenTab[]
  activeTabPath:   string | null
  gitStatus:       GitStatus | null
  sidebarPanel:    'explorer' | 'search' | 'git' | 'extensions'
  settingsOpen:    boolean
  panelVisible:    boolean
  panelTab:        'output' | 'problems'
  commandPaletteOpen: boolean

  // Actions
  setProjects:       (projects: Project[]) => void
  setActiveProject:  (project: Project | null) => void
  setFileTree:       (nodes: FileNode[]) => void
  openTab:           (tab: OpenTab) => void
  closeTab:          (path: string) => void
  setActiveTab:      (path: string) => void
  markTabModified:   (path: string, modified: boolean) => void
  updateTabContent:  (path: string, content: string) => void
  setGitStatus:      (status: GitStatus | null) => void
  setSidebarPanel:   (panel: CodeState['sidebarPanel']) => void
  togglePanel:       () => void
  setPanelTab:       (tab: CodeState['panelTab']) => void
  toggleCommandPalette: () => void
  openSettings:      () => void
  closeSettings:     () => void
}

export const useCodeStore = create<CodeState>((set) => ({
  projects:           [],
  activeProject:      null,
  fileTree:           [],
  openTabs:           [],
  activeTabPath:      null,
  gitStatus:          null,
  sidebarPanel:       'explorer',
  settingsOpen:       false,
  panelVisible:       true,
  panelTab:           'output',
  commandPaletteOpen: false,

  setProjects:      (projects) => set({ projects }),
  setActiveProject: (project) => set({ activeProject: project, fileTree: [], openTabs: [], activeTabPath: null, gitStatus: null }),
  setFileTree:      (nodes) => set({ fileTree: nodes }),

  openTab: (tab) => set((state) => {
    const exists = state.openTabs.find(t => t.path === tab.path && t.projectId === tab.projectId)
    if (exists) return { activeTabPath: tab.path }
    return { openTabs: [...state.openTabs, tab], activeTabPath: tab.path }
  }),

  closeTab: (path) => set((state) => {
    const tabs    = state.openTabs.filter(t => t.path !== path)
    const active  = state.activeTabPath === path
      ? (tabs.length > 0 ? tabs[tabs.length - 1].path : null)
      : state.activeTabPath
    return { openTabs: tabs, activeTabPath: active }
  }),

  setActiveTab:    (path) => set({ activeTabPath: path }),

  markTabModified: (path, modified) => set((state) => ({
    openTabs: state.openTabs.map(t => t.path === path ? { ...t, modified } : t),
  })),

  updateTabContent: (path, content) => set((state) => ({
    openTabs: state.openTabs.map(t => t.path === path ? { ...t, content, modified: true } : t),
  })),

  setGitStatus:    (status) => set({ gitStatus: status }),
  setSidebarPanel: (panel) => set({ sidebarPanel: panel }),
  openSettings:    () => set({ settingsOpen: true }),
  closeSettings:   () => set({ settingsOpen: false }),
  togglePanel:     () => set((state) => ({ panelVisible: !state.panelVisible })),
  setPanelTab:     (tab) => set({ panelTab: tab }),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
}))
