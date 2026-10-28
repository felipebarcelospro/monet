import type { AssetSummary, NoteSummary } from '../shared/contract'

/** What a link or embed points at, once the vault is known. */
export type Resolved =
  | { kind: 'image'; url: string; path: string }
  | { kind: 'video'; url: string; path: string }
  | { kind: 'audio'; url: string; path: string }
  | { kind: 'file'; path: string }
  | { kind: 'note'; id: string; title: string }
  | { kind: 'external'; url: string }
  | { kind: 'missing'; target: string }

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|tiff)$/iu
const VIDEO = /\.(mp4|webm|mov|m4v|ogv|mkv)$/iu
const AUDIO = /\.(mp3|wav|m4a|ogg|flac|aac)$/iu
const REMOTE = /^(?:https?:|data:|blob:)/iu

/** Builds the URL the window uses to read a file from the vault. */
export function assetUrl(path: string): string {
  return `monet://asset/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** The folder of a vault-relative note path. */
export function folderOf(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}

/** Joins and normalises two vault-relative paths. */
function joinPath(folder: string, target: string): string {
  const parts = `${folder}/${target}`.split('/')
  const stack: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

/** Finds an attachment by its file name, wherever it lives in the vault. */
export function findAssetByName(assets: AssetSummary[], name: string): AssetSummary | undefined {
  const lower = name.toLowerCase()
  const stem = lower.replace(/\.[^./]+$/u, '')
  return (
    assets.find((asset) => asset.name.toLowerCase() === lower) ??
    assets.find((asset) => asset.path.toLowerCase().endsWith(`/${lower}`)) ??
    assets.find((asset) => asset.name.toLowerCase().replace(/\.[^./]+$/u, '') === stem)
  )
}

/** Kinds a file can be rendered as, from its extension. */
export function mediaKind(path: string): 'image' | 'video' | 'audio' | 'file' {
  if (IMAGE.test(path)) return 'image'
  if (VIDEO.test(path)) return 'video'
  if (AUDIO.test(path)) return 'audio'
  return 'file'
}

/**
 * Resolves a Markdown link target to something the window can show.
 *
 * The order follows the vault: the note's own folder first, then the vault
 * root, then a unique file name anywhere in the vault. That is what makes
 * `![](foto.png)` and `![[foto.png]]` both work from any folder.
 */
export function resolveTarget(
  target: string,
  notePath: string,
  assets: AssetSummary[],
  notes: NoteSummary[],
): Resolved {
  const trimmed = target.trim()
  if (REMOTE.test(trimmed)) return { kind: 'external', url: trimmed }

  // `[[Note#Heading]]` and `[[Note^block]]` point at the note: the fragment is
  // not part of the file name.
  const base = trimmed.split('#')[0]?.split('^')[0]?.trim() || trimmed

  if (notes.length > 0) {
    const lower = base.toLowerCase()
    const clean = lower.replace(/\.md$/u, '')
    const note =
      notes.find((item) => item.id.toLowerCase() === clean) ??
      notes.find((item) => item.title.toLowerCase() === clean) ??
      notes.find((item) => item.path.replace(/\.md$/u, '').toLowerCase() === clean) ??
      notes.find((item) => item.id.toLowerCase().endsWith(`/${clean}`))
    if (note) return { kind: 'note', id: note.id, title: note.title }
  }

  const relative = joinPath(folderOf(notePath), base)
  const direct =
    assets.find((asset) => asset.path === relative) ??
    assets.find((asset) => asset.path === base) ??
    findAssetByName(assets, base.split('/').pop() ?? base)

  if (direct) {
    const kind = mediaKind(direct.path)
    const url = assetUrl(direct.path)
    if (kind === 'file') return { kind, path: direct.path }
    return { kind, url, path: direct.path }
  }

  const guessed = mediaKind(base)
  if (guessed !== 'file') {
    return { kind: guessed, url: assetUrl(relative), path: relative }
  }

  if (base.includes('/') || /\.[a-z0-9]{1,5}$/iu.test(base)) {
    return { kind: 'file', path: relative }
  }

  return { kind: 'missing', target: base }
}
