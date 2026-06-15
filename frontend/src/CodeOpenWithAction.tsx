import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Code2 } from 'lucide-react'
import { useFilesOpenWith } from '@kubuno/drive'
// MIME types et extensions que Code peut ouvrir
const CODE_MIMES = new Set([
  'text/plain', 'text/html', 'text/css', 'text/javascript', 'text/typescript',
  'text/x-python', 'text/x-rust', 'text/x-go', 'text/x-c', 'text/x-cpp',
  'text/x-java', 'text/x-sh', 'text/x-shellscript', 'text/x-yaml',
  'text/x-toml', 'text/x-dockerfile', 'text/markdown',
  'application/json', 'application/xml', 'application/javascript',
  'application/typescript', 'application/x-sh',
])

export function isCodeFile(mimeType: string, name: string): boolean {
  if (CODE_MIMES.has(mimeType)) return true
  if (mimeType.startsWith('text/')) return true
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ['rs', 'py', 'ts', 'tsx', 'js', 'jsx', 'go', 'c', 'cpp', 'h',
          'java', 'kt', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'toml', 'md',
          'json', 'xml', 'html', 'css', 'scss', 'sql', 'dockerfile',
          'gitignore', 'env', 'lock'].includes(ext)
}

export default function CodeOpenWithAction() {
  const { t }    = useTranslation('code')
  const file     = useFilesOpenWith()
  const navigate = useNavigate()

  if (!file || !isCodeFile(file.mime_type, file.name)) return null

  const handleOpen = () => {
    navigate(`/code?from_files_id=${file.id}&from_files_name=${encodeURIComponent(file.name)}`)
  }

  return (
    <button
      onClick={handleOpen}
      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-primary
                 hover:bg-surface-1 cursor-pointer outline-none transition-colors"
    >
      <Code2 size={14} />
      {t('code_open_with_label')}
    </button>
  )
}
