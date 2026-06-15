/**
 * Accès au service de fichiers du module `files` via ModuleServiceRegistry.
 *
 * Le module `code` ne connaît pas l'existence du module `files` directement —
 * il passe uniquement par le registre de services publié par files/register.ts.
 * Si le module files n'est pas chargé, les appels retournent undefined sans erreur.
 */
import { ModuleServiceRegistry } from '@kubuno/sdk'
import type { Folder, FileItem } from '@kubuno/drive'
function files() {
  return ModuleServiceRegistry
}

export const filesService = {
  isAvailable: (): boolean => !!ModuleServiceRegistry.get('drive', 'listFolders'),

  // ── Dossiers ──────────────────────────────────────────────────────────────
  listFolders: (parentId?: string | null): Promise<{ folders: Folder[] }> | undefined =>
    files().call('drive', 'listFolders', parentId),

  getFolder: (id: string): Promise<{ folder: Folder; ancestors: unknown[] }> | undefined =>
    files().call('drive', 'getFolder', id),

  createFolder: (name: string, parentId?: string | null): Promise<{ folder: Folder }> | undefined =>
    files().call('drive', 'createFolder', name, parentId ?? null),

  renameFolder: (id: string, name: string): Promise<{ folder: Folder }> | undefined =>
    files().call('drive', 'renameFolder', id, name),

  deleteFolder: (id: string): Promise<void> | undefined =>
    files().call('drive', 'deleteFolder', id),

  // ── Fichiers ──────────────────────────────────────────────────────────────
  listFiles: (folderId?: string | null): Promise<{ files: FileItem[] }> | undefined =>
    files().call('drive', 'listFiles', folderId),

  uploadFile: (file: File, folderId?: string | null): Promise<{ file: FileItem }> | undefined =>
    files().call('drive', 'uploadFile', file, folderId),

  renameFile: (id: string, name: string): Promise<{ file: FileItem }> | undefined =>
    files().call('drive', 'renameFile', id, name),

  trashFile: (id: string): Promise<void> | undefined =>
    files().call('drive', 'trashFile', id),

  restoreFile: (id: string): Promise<void> | undefined =>
    files().call('drive', 'restoreFile', id),

  deleteFile: (id: string): Promise<void> | undefined =>
    files().call('drive', 'deleteFile', id),

  downloadUrl: (id: string): string | undefined =>
    files().call('drive', 'downloadUrl', id),

  // Ouvre le sélecteur de fichiers du module files dans une popup
  openFilePicker: (opts?: object): unknown =>
    files().call('drive', 'openFilePicker', opts),

  // Ouvre le sélecteur de dossier — retourne { id: string | null, name: string } | null
  pickFolder: (opts?: object): Promise<{ id: string | null; name: string } | null> | undefined =>
    files().call('drive', 'pickFolder', opts),
}
