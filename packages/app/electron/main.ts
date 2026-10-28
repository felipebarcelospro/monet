import { existsSync, realpathSync, writeFileSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  BrowserWindow,
  app,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  shell,
} from 'electron'

import { readConfig, writeConfig } from '@monet/core'

import type {
  AppInfo,
  CreateNoteInput,
  FrontmatterInput,
  Locale,
  MenuAction,
  Preferences,
  Theme,
} from '../src/shared/contract'
import { buildMenu } from './menu'
import { PreferencesStore } from './preferences'
import { VaultService } from './vault-service'

app.setName('Monet')

// `monet://asset/<path>` serves a file from the open vault to the window.
// Registering the scheme before `ready` is what lets images and video stream
// with the browser's own decoder instead of being copied through IPC.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'monet',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])
// A second profile is useful for automated captures: the single-instance lock
// is per profile, so a test run does not disturb the window the user has open.
app.setPath('userData', process.env.MONET_USER_DATA ?? join(app.getPath('appData'), 'Monet'))

/** The command line options the app understands. */
interface LaunchOptions {
  vault?: string
  note?: string
  view?: string
  palette?: string
  settings?: boolean
  reading?: boolean
  scroll?: number
  capture?: string
  width: number
  height: number
  theme?: Theme
  locale?: Locale
}

/** Reads the launch options from the process arguments. */
function parseArgs(argv: string[]): LaunchOptions {
  const options: LaunchOptions = { width: 1440, height: 900 }
  const args = argv.slice(app.isPackaged ? 1 : 2)

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg) continue
    const next = args[index + 1]

    switch (arg) {
      case '--vault':
        if (next) options.vault = resolve(next)
        index += 1
        break
      case '--note':
        if (next) options.note = next
        index += 1
        break
      case '--view':
        if (next) options.view = next
        index += 1
        break
      case '--palette':
        if (next) options.palette = next
        index += 1
        break
      case '--reading':
        options.reading = true
        break
      case '--scroll':
        if (next) options.scroll = Number(next)
        index += 1
        break
      case '--settings':
        options.settings = true
        break
      case '--capture':
        if (next) options.capture = resolve(next)
        index += 1
        break
      case '--width':
        if (next) options.width = Number(next) || options.width
        index += 1
        break
      case '--height':
        if (next) options.height = Number(next) || options.height
        index += 1
        break
      case '--theme':
        if (next === 'light' || next === 'dark' || next === 'system') options.theme = next
        index += 1
        break
      case '--locale':
        if (next === 'en' || next === 'pt-BR' || next === 'es') options.locale = next
        index += 1
        break
      default:
        if (!arg.startsWith('-') && existsSync(arg) && !options.vault) {
          options.vault = resolve(arg)
        }
    }
  }
  return options
}

const options = parseArgs(process.argv)
const service = new VaultService()
const preferences = new PreferencesStore()

if (options.theme) preferences.set({ theme: options.theme })
if (options.locale) preferences.set({ locale: options.locale })

let window: BrowserWindow | null = null
let captureTimer: NodeJS.Timeout | null = null

// ---------------------------------------------------------------------------
// Vault lifecycle
// ---------------------------------------------------------------------------

/** Opens a vault and remembers it. Returns `null` when the folder is invalid. */
function openVault(path: string): AppInfo['vault'] {
  const snapshot = service.open(path)
  const config = readConfig()
  const recent = [
    snapshot.root,
    ...(config.recentVaults ?? []).filter((candidate) => candidate !== snapshot.root),
  ].slice(0, 8)
  writeConfig({ ...config, vault: snapshot.root, recentVaults: recent })
  return snapshot
}

/** The recent vaults that still exist. */
function recentVaults(): string[] {
  const config = readConfig()
  return (config.recentVaults ?? []).filter((path) => existsSync(path))
}

/** The vault that should open when the window appears. */
function initialVault(): string | undefined {
  if (options.vault) return options.vault
  const config = readConfig()
  if (config.vault && existsSync(config.vault)) return config.vault
  return recentVaults()[0]
}

// ---------------------------------------------------------------------------
// Vault files
// ---------------------------------------------------------------------------

/** The content type of a file, for the custom protocol. */
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
}

/**
 * Turns a request into an absolute path inside the vault.
 *
 * Returns `null` for anything that tries to leave the vault: the window never
 * gets to name an arbitrary file on the disk.
 */
function vaultFile(request: Request): string | null {
  const root = service.root
  if (!root) return null

  let relative: string
  try {
    relative = decodeURIComponent(new URL(request.url).pathname.replace(/^\//u, ''))
  } catch {
    return null
  }

  const absolute = resolve(root, relative)
  const inside = absolute === root || absolute.startsWith(root.endsWith(sep) ? root : root + sep)
  if (!inside || !existsSync(absolute)) return null
  try {
    const realRoot = realpathSync(root)
    const real = realpathSync(absolute)
    if (real !== realRoot && !real.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)) {
      return null
    }
  } catch {
    return null
  }
  return absolute
}

/** Serves `monet://asset/<vault-relative path>`. */
function registerAssetProtocol(): void {
  protocol.handle('monet', async (request) => {
    const absolute = vaultFile(request)
    if (!absolute) return new Response('Not found', { status: 404 })

    const response = await net.fetch(pathToFileURL(absolute).toString())
    const type = CONTENT_TYPES[extname(absolute).toLowerCase()]
    if (!type) return response
    const headers = new Headers(response.headers)
    headers.set('Content-Type', type)
    headers.set('Cache-Control', 'no-cache')
    return new Response(response.body, { status: response.status, headers })
  })
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

/** The query string that routes the renderer on boot. */
function bootQuery(): Record<string, string> {
  const query: Record<string, string> = {}
  if (options.note) query['note'] = options.note
  if (options.view) query['view'] = options.view
  if (options.palette) query['palette'] = options.palette
  if (options.settings) query['settings'] = '1'
  if (options.reading) query['reading'] = '1'
  if (options.capture) query['capture'] = '1'
  return query
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: options.width,
    height: options.height,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#FBFAF7',
    roundedCorners: true,
    title: 'Monet',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })

  win.webContents.on('console-message', (_event, _level, message, line, source) => {
    process.stdout.write(`[renderer] ${message} (${source}:${line})\n`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    process.stderr.write(`[renderer] gone: ${details.reason}\n`)
  })

  win.once('ready-to-show', () => {
    win.show()
    if (!options.capture) win.focus()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (url !== current) event.preventDefault()
  })

  const devURL = process.env['VITE_DEV_SERVER_URL']
  const query = bootQuery()
  if (devURL) {
    const url = new URL(devURL)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(join(__dirname, '..', 'dist', 'index.html'), { query })
  }

  if (options.capture) {
    win.webContents.once('did-finish-load', () => {
      captureTimer = setTimeout(() => {
        void captureWindow(win, options.capture!)
      }, 1600)
    })
  }

  win.on('closed', () => {
    if (window === win) window = null
  })

  return win
}

/** Saves a PNG of the window, used by the documentation screenshots. */
async function captureWindow(win: BrowserWindow, path: string): Promise<void> {
  try {
    if (typeof options.scroll === 'number') {
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.editor-scroll'); if (el) el.scrollTop = ${options.scroll}; window.scrollTo(0, ${options.scroll}); })()`,
      )
      await new Promise((resolve) => setTimeout(resolve, 700))
      // Rendered blocks grow after the first pass; position again once the
      // document has its final height.
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.editor-scroll'); if (el) el.scrollTop = ${options.scroll}; window.scrollTo(0, ${options.scroll}); })()`,
      )
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    if (process.env['MONET_DEBUG_DOM']) {
      const info = await win.webContents.executeJavaScript(
        `(() => ({ live: [...document.querySelectorAll('.cm-live')].map((el) => el.className), tasks: document.querySelectorAll('.cm-task').length, sel: String(window.getSelection()?.anchorNode?.textContent ?? '').slice(0, 30) }))()`,
      )
      process.stdout.write(`[debug] ${JSON.stringify(info)}\n`)
    }
    const image = await win.webContents.capturePage()
    writeFileSync(path, image.toPNG())
    process.stdout.write(`captured ${path}\n`)
  } catch (error) {
    process.stderr.write(`capture failed: ${String(error)}\n`)
  } finally {
    if (captureTimer) clearTimeout(captureTimer)
    captureTimer = null
    app.quit()
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`)
  return value
}

function registerIpc(): void {
  ipcMain.handle(
    'app:info',
    (): AppInfo => ({
      version: app.getVersion(),
      platform: process.platform,
      preferences: preferences.get(),
      recentVaults: recentVaults(),
      vault: service.snapshot(),
    }),
  )

  ipcMain.handle('vault:openDialog', async (): Promise<AppInfo['vault']> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Open',
      message: 'Choose a folder of Markdown files',
    })
    if (result.canceled || !result.filePaths[0]) return null
    return openVault(result.filePaths[0])
  })

  ipcMain.handle('vault:createDialog', async (): Promise<AppInfo['vault']> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Create',
      message: 'Choose where to create the vault',
    })
    if (result.canceled || !result.filePaths[0]) return null
    return openVault(result.filePaths[0])
  })

  ipcMain.handle('vault:open', (_event, path: unknown): AppInfo['vault'] => {
    return openVault(asString(path, 'path'))
  })

  ipcMain.handle('vault:close', () => {
    service.close()
  })

  ipcMain.handle('vault:snapshot', () => service.snapshot())

  ipcMain.handle('vault:read', (_event, id: unknown) => service.read(asString(id, 'id')))

  ipcMain.handle('vault:write', (_event, id: unknown, body: unknown, revision: unknown) =>
    service.write(
      asString(id, 'id'),
      asString(body, 'body'),
      revision === undefined || revision === null ? undefined : asString(revision, 'revision'),
    ),
  )

  ipcMain.handle('vault:create', (_event, input: CreateNoteInput) => service.create(input))

  ipcMain.handle('vault:rename', (_event, id: unknown, title: unknown) =>
    service.rename(asString(id, 'id'), asString(title, 'title')),
  )

  ipcMain.handle('vault:renameFolder', (_event, path: unknown, name: unknown) =>
    service.renameFolder(asString(path, 'path'), asString(name, 'name')),
  )

  ipcMain.handle('vault:delete', async (_event, id: unknown) => {
    const note = service.read(asString(id, 'id'))
    if (!note || !service.root) throw new Error('Note not found')
    return service.delete(note.id, (path) => shell.trashItem(path))
  })

  ipcMain.handle('vault:openAsset', async (_event, path: unknown) => {
    const root = service.root
    if (!root) return
    const relative = asString(path, 'path')
    const absolute = resolve(root, relative)
    const inside = absolute.startsWith(root.endsWith(sep) ? root : root + sep)
    if (!inside || !existsSync(absolute)) throw new Error('File not found')
    const realRoot = realpathSync(root)
    const real = realpathSync(absolute)
    if (real !== realRoot && !real.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)) {
      throw new Error('File not found')
    }
    const error = await shell.openPath(absolute)
    if (error.length > 0) throw new Error(error)
  })

  ipcMain.handle('vault:reveal', (_event, id: unknown) => {
    const note = service.read(asString(id, 'id'))
    if (!note || !service.root) return
    shell.showItemInFolder(join(service.root, note.path))
  })

  ipcMain.handle(
    'vault:frontmatter',
    (_event, id: unknown, key: unknown, value: unknown, revision: unknown) =>
      service.updateFrontmatter(
        asString(id, 'id'),
        asString(key, 'key'),
        normalizeFrontmatter(value),
        revision === undefined || revision === null ? undefined : asString(revision, 'revision'),
      ),
  )

  ipcMain.handle('vault:search', (_event, query: unknown, limit: unknown) =>
    service.search(asString(query, 'query'), typeof limit === 'number' ? limit : 60),
  )

  ipcMain.handle('vault:graph', () => service.graph())

  ipcMain.handle('prefs:set', (_event, patch: Partial<Preferences>) => {
    const next = preferences.set(patch)
    nativeTheme.themeSource = next.theme
    buildMenu(next.locale, next.theme, menuActions)
    if (window && !window.isDestroyed()) {
      window.webContents.send('prefs:changed', next)
    }
    return next
  })

  ipcMain.handle('app:copy', (_event, text: unknown) => {
    clipboard.writeText(asString(text, 'text'))
  })

  ipcMain.handle('window:minimize', () => window?.minimize())
  ipcMain.handle('window:close', () => window?.close())
  ipcMain.handle('window:zoom', () => {
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.handle('window:fullscreen', () => {
    if (window) window.setFullScreen(!window.isFullScreen())
  })
}

function normalizeFrontmatter(value: unknown): FrontmatterInput {
  if (value === null) return null
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => String(item))
  throw new Error('Unsupported frontmatter value')
}

function send(action: MenuAction): void {
  window?.webContents.send('menu:action', action)
}

function applyLocale(locale: Locale): void {
  const next = preferences.set({ locale })
  buildMenu(next.locale, next.theme, menuActions)
  window?.webContents.send('prefs:changed', next)
}

function applyTheme(theme: Theme): void {
  const next = preferences.set({ theme })
  nativeTheme.themeSource = theme
  buildMenu(next.locale, next.theme, menuActions)
  window?.webContents.send('prefs:changed', next)
}

const menuActions = {
  send,
  setLocale: applyLocale,
  setTheme: applyTheme,
}

// ---------------------------------------------------------------------------
// Application lifecycle
// ---------------------------------------------------------------------------

const lock = app.requestSingleInstanceLock()
if (!lock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const next = parseArgs(argv)
    if (next.vault) {
      try {
        openVault(next.vault)
        window?.webContents.send('vault:changed', service.snapshot())
      } catch {
        // A bad path from a second launch is ignored; the first window wins.
      }
    }
    if (window) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
  })

  app.on('open-file', (event, path) => {
    event.preventDefault()
    if (!window) return
    try {
      openVault(path)
      window.webContents.send('vault:changed', service.snapshot())
    } catch {
      // A file that is not a vault is ignored.
    }
  })

  app.whenReady().then(() => {
    service.onChanged = (notes, snapshot) => {
      if (!window || window.isDestroyed()) return
      if (snapshot) window.webContents.send('vault:changed', snapshot)
      for (const note of notes) window.webContents.send('note:changed', note)
    }

    nativeTheme.themeSource = preferences.get().theme
    registerAssetProtocol()
    registerIpc()

    const vault = initialVault()
    if (vault) {
      try {
        openVault(vault)
      } catch {
        // The welcome screen takes over when the last vault is gone.
      }
    }

    const prefs = preferences.get()
    buildMenu(prefs.locale, prefs.theme, menuActions)
    window = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        window = createWindow()
      } else {
        window?.show()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    service.close()
  })
}
