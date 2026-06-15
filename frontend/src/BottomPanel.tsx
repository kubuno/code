import { useTranslation } from 'react-i18next'
import { useCodeStore } from './store'
import type { Project } from './api'

interface Props {
  project: Project
}

// Le terminal intégré a été retiré : il ouvrait un shell sur la machine hôte, ce
// qui permettait d'exécuter des commandes sur le serveur. Le panneau ne conserve
// que les onglets passifs Sortie / Problèmes.
export function BottomPanel({ project: _project }: Props) {
  const { t } = useTranslation('code')
  const { panelTab, setPanelTab } = useCodeStore()

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center bg-[#252526] border-b border-[#333] shrink-0">
        {(['output', 'problems'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setPanelTab(tab)}
            className={`px-4 py-1.5 text-[12px] border-b-2 transition-colors ${
              panelTab === tab
                ? 'border-[#007acc] text-[#cccccc]'
                : 'border-transparent text-[#858585] hover:text-[#cccccc]'
            }`}
          >
            {tab === 'output' ? t('code_output') : t('code_problems')}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {panelTab === 'output' && (
          <div className="h-full flex items-center justify-center text-[#858585] text-[12px]">
            {t('code_no_output')}
          </div>
        )}
        {panelTab === 'problems' && (
          <div className="h-full flex items-center justify-center text-[#858585] text-[12px]">
            {t('code_no_problems')}
          </div>
        )}
      </div>
    </div>
  )
}
