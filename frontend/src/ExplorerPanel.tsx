import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConfirm } from '@kubuno/sdk'
import { prompt } from '@kubuno/sdk'
import { ConfirmDialog } from '@ui'
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  FilePlus, FolderPlus, RefreshCw, Trash2,
} from 'lucide-react'
import { useCodeStore } from './store'
import { codeApi } from './api'
import type { FileNode, Project } from './api'
import clsx from 'clsx'
import { getLanguageFromPath } from './utils'

interface Props {
  project: Project
}

export function ExplorerPanel({ project }: Props) {
  const { t } = useTranslation('code')
  const { fileTree, openTab, activeTabPath } = useCodeStore()
  const queryClient = useQueryClient()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbe]">
        <span className="truncate">{project.name.toUpperCase()}</span>
        <div className="flex gap-1">
          <button
            title={t('code_new_file')}
            className="p-1 hover:bg-[#37373d] rounded text-[#c5c5c5]"
            onClick={() => promptNewFile(project.id, '', queryClient, t)}
          >
            <FilePlus size={14} />
          </button>
          <button
            title={t('code_new_folder')}
            className="p-1 hover:bg-[#37373d] rounded text-[#c5c5c5]"
            onClick={() => promptNewFolder(project.id, '', queryClient, t)}
          >
            <FolderPlus size={14} />
          </button>
          <button
            title={t('code_refresh')}
            className="p-1 hover:bg-[#37373d] rounded text-[#c5c5c5]"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['code-tree', project.id] })}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto text-[13px]">
        {fileTree.map(node => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            project={project}
            activeTabPath={activeTabPath}
            onOpenFile={(node) => {
              openFileInEditor(project.id, node, openTab)
            }}
          />
        ))}
      </div>
    </div>
  )
}

interface NodeProps {
  node:          FileNode
  depth:         number
  project:       Project
  activeTabPath: string | null
  onOpenFile:    (node: FileNode) => void
}

function FileTreeNode({ node, depth, project, activeTabPath, onOpenFile }: NodeProps) {
  const { t } = useTranslation('code')
  const [expanded, setExpanded] = useState(depth === 0)
  const queryClient = useQueryClient()
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm()

  const { data: children } = useQuery({
    queryKey: ['code-tree', project.id, node.path],
    queryFn:  () => codeApi.getTree(project.id, node.path),
    enabled:  node.is_dir && expanded,
  })

  const handleClick = () => {
    if (node.is_dir) {
      setExpanded(e => !e)
    } else {
      onOpenFile(node)
    }
  }

  const isActive = !node.is_dir && activeTabPath === node.path

  return (
    <div>
      <div
        className={clsx(
          'flex items-center gap-1 px-2 py-0.5 cursor-pointer select-none group',
          'hover:bg-[#2a2d2e]',
          isActive && 'bg-[#37373d]',
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={handleClick}
      >
        {node.is_dir ? (
          <>
            <span className="w-4 text-[#c5c5c5]">
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <span className="text-[#c09553]">
              {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
            </span>
          </>
        ) : (
          <>
            <span className="w-4" />
            <span className="text-[#c5c5c5]"><File size={14} /></span>
          </>
        )}
        <span className="flex-1 truncate text-[#cccccc]">{node.name}</span>

        {/* Context actions (delete) */}
        <button
          title={t('common_delete')}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 rounded text-[#858585]"
          onClick={async (e) => {
            e.stopPropagation()
            const ok = await confirm({
              title:        t('code_delete_confirm_title', { name: node.name }),
              message:      t('code_delete_irreversible'),
              confirmLabel: t('common_delete'),
              variant:      'danger',
            })
            if (ok) {
              codeApi.deleteFile(project.id, node.path).then(() =>
                queryClient.invalidateQueries({ queryKey: ['code-tree', project.id] })
              )
            }
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {node.is_dir && expanded && children && (
        <div>
          {children.map(child => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              project={project}
              activeTabPath={activeTabPath}
              onOpenFile={onOpenFile}
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

// ── helpers ──────────────────────────────────────────────────────────────────

async function openFileInEditor(
  projectId: string,
  node: FileNode,
  openTab: (tab: import('./store').OpenTab) => void,
) {
  if (node.is_dir) return
  const content = await codeApi.readFile(projectId, node.path)
  openTab({
    projectId,
    path:     node.path,
    name:     node.name,
    content,
    modified: false,
    language: getLanguageFromPath(node.path),
  })
}

async function promptNewFile(
  projectId: string,
  dir: string,
  qc: ReturnType<typeof useQueryClient>,
  t: (key: string) => string,
) {
  const name = await prompt({ title: t('code_new_file'), placeholder: t('code_file_name') })
  if (!name) return
  const path = dir ? `${dir}/${name}` : name
  codeApi.writeFile(projectId, path, '').then(() =>
    qc.invalidateQueries({ queryKey: ['code-tree', projectId] })
  )
}

async function promptNewFolder(
  projectId: string,
  dir: string,
  qc: ReturnType<typeof useQueryClient>,
  t: (key: string) => string,
) {
  const name = await prompt({ title: t('code_new_folder'), placeholder: t('code_folder_name') })
  if (!name) return
  const path = dir ? `${dir}/${name}` : name
  codeApi.mkdir(projectId, path).then(() =>
    qc.invalidateQueries({ queryKey: ['code-tree', projectId] })
  )
}
