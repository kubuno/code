/**
 * Point d'entrée du bundle MODULE code (IDE web), chargé à l'exécution. Buildé
 * séparément via `vite.module.config.ts` ; specifiers partagés résolus au runtime
 * par l'import map du host. Monaco est chargé depuis le CDN (cf. monacoSetup),
 * donc pas embarqué. Le host importe ce fichier puis appelle `register()` ;
 * `sdkVersion` permet de rejeter une incompatibilité de contrat.
 */
import { lazy } from 'react'
import {
  RouteRegistry,
  WaffleAppRegistry,
  WidgetRegistry,
  SlotRegistry,
  FaviconRegistry,
  ModuleSettingsRegistry,
  useSidebarStore,
  useToolbarStore,
  SDK_VERSION,
} from '@kubuno/sdk'
import './index.css'
import './i18n'
import './monacoSetup'
import CodeLogo from './CodeLogo'
import CodeRecentWidget from './CodeRecentWidget'
import CodeSidebarBody from './CodeSidebarBody'
import CodeOpenWithAction, { isCodeFile } from './CodeOpenWithAction'

export const sdkVersion = SDK_VERSION

export function register() {
  FaviconRegistry.register('code', '/code-logo.svg')

  WaffleAppRegistry.register('code', 'Code', [
    { id: 'code', label: 'Code', Icon: CodeLogo, path: '/code' },
  ])

  // The header gear button opens the per-user Code settings while in /code.
  ModuleSettingsRegistry.register('code')

  WidgetRegistry.register({
    id:        'code-recent',
    moduleId:  'code',
    Component: CodeRecentWidget,
    size:      'small',
    order:     70,
  })

  useSidebarStore.getState().register({
    moduleId:    'code',
    routePrefix: '/code',
    SidebarBody: CodeSidebarBody,
    collapsedBody: true,
  })

  useToolbarStore.getState().register({
    moduleId:    'code',
    routePrefix: '/code',
    noPadding:   true,
  })

  useToolbarStore.getState().register({
    moduleId:    'code-settings',
    routePrefix: '/code/settings',
  })

  SlotRegistry.register('files-open-with', 'code', CodeOpenWithAction, (file) => {
    const f = file as { mime_type?: string; name?: string } | undefined
    return !!f && isCodeFile(f.mime_type ?? '', f.name ?? '')
  })

  // Routes
  const CodeApp          = lazy(() => import('./CodeApp'))
  const CodeSettingsPage = lazy(() => import('./CodeSettingsPage'))

  RouteRegistry.register('code',          CodeApp)
  RouteRegistry.register('code/settings', CodeSettingsPage)
}
