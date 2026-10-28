import { contextBridge, ipcRenderer } from 'electron'

import type {
  CreateNoteInput,
  FrontmatterInput,
  MonetApi,
  Preferences,
  VaultSnapshot,
} from '../src/shared/contract'

/**
 * The only bridge between the window and the machine.
 *
 * The renderer gets a handful of narrow methods and a few event
 * subscriptions. It cannot require Node, read arbitrary files, or open a
 * shell; every operation is validated and performed by the main process.
 */
const api: MonetApi = {
  info: () => ipcRenderer.invoke('app:info'),
  openVaultDialog: () => ipcRenderer.invoke('vault:openDialog'),
  createVaultDialog: () => ipcRenderer.invoke('vault:createDialog'),
  openVault: (path: string) => ipcRenderer.invoke('vault:open', path),
  closeVault: () => ipcRenderer.invoke('vault:close'),
  snapshot: () => ipcRenderer.invoke('vault:snapshot'),
  readNote: (id: string) => ipcRenderer.invoke('vault:read', id),
  writeNote: (id: string, body: string) => ipcRenderer.invoke('vault:write', id, body),
  createNote: (input: CreateNoteInput) => ipcRenderer.invoke('vault:create', input),
  renameNote: (id: string, title: string) => ipcRenderer.invoke('vault:rename', id, title),
  deleteNote: (id: string) => ipcRenderer.invoke('vault:delete', id),
  renameFolder: (path: string, name: string) =>
    ipcRenderer.invoke('vault:renameFolder', path, name),
  revealNote: (id: string) => ipcRenderer.invoke('vault:reveal', id),
  openAsset: (path: string) => ipcRenderer.invoke('vault:openAsset', path),
  updateFrontmatter: (id: string, key: string, value: FrontmatterInput) =>
    ipcRenderer.invoke('vault:frontmatter', id, key, value),
  search: (query: string, limit?: number) => ipcRenderer.invoke('vault:search', query, limit),
  graph: () => ipcRenderer.invoke('vault:graph'),
  setPreferences: (patch: Partial<Preferences>) => ipcRenderer.invoke('prefs:set', patch),

  onVaultChanged: (listener: (snapshot: VaultSnapshot) => void) => {
    const handler = (_event: unknown, snapshot: VaultSnapshot): void => listener(snapshot)
    ipcRenderer.on('vault:changed', handler)
    return () => ipcRenderer.removeListener('vault:changed', handler)
  },
  onNoteChanged: (listener: (event: { id: string; modifiedAt: number }) => void) => {
    const handler = (_event: unknown, payload: { id: string; modifiedAt: number }): void =>
      listener(payload)
    ipcRenderer.on('note:changed', handler)
    return () => ipcRenderer.removeListener('note:changed', handler)
  },
  onMenuAction: (listener) => {
    const handler = (_event: unknown, action: Parameters<typeof listener>[0]): void =>
      listener(action)
    ipcRenderer.on('menu:action', handler)
    return () => ipcRenderer.removeListener('menu:action', handler)
  },
  onPreferencesChanged: (listener: (preferences: Preferences) => void) => {
    const handler = (_event: unknown, preferences: Preferences): void => listener(preferences)
    ipcRenderer.on('prefs:changed', handler)
    return () => ipcRenderer.removeListener('prefs:changed', handler)
  },

  minimize: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  zoomWindow: () => ipcRenderer.invoke('window:zoom'),
  toggleFullscreen: () => ipcRenderer.invoke('window:fullscreen'),
  copyText: (text: string) => ipcRenderer.invoke('app:copy', text),
}

contextBridge.exposeInMainWorld('monet', api)
