import { useStore } from '../state/store'

/** File extensions the renderer can show inline. */
const INLINE =
  /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|tiff|mp4|webm|mov|m4v|ogv|mp3|wav|m4a|ogg|flac|aac)$/iu

/**
 * Whether a standalone `![[…]]` or `![…](…)` line should render as a block.
 *
 * The check is deliberately conservative: while the user is still typing the
 * target, the line stays as text instead of flashing a broken placeholder.
 */
export function startsBlock(text: string): boolean {
  const snapshot = useStore.getState().snapshot

  const wiki = /^!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/u.exec(text)
  if (wiki) {
    const target = (wiki[1] ?? '').trim()
    if (target.length === 0) return false
    if (INLINE.test(target)) return true
    const name = target.split('/').pop()?.toLowerCase() ?? target.toLowerCase()
    if (snapshot?.assets.some((asset) => asset.name.toLowerCase() === name)) return true
    const lower = target.toLowerCase()
    const note = snapshot?.notes.find(
      (item) =>
        item.title.toLowerCase() === lower ||
        item.id.toLowerCase() === lower ||
        item.id.toLowerCase().endsWith(`/${lower}`),
    )
    return Boolean(note)
  }

  const markdown = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/u.exec(text)
  if (markdown) {
    const target = (markdown[2] ?? '').trim()
    if (target.length === 0) return false
    if (INLINE.test(target)) return true
    if (/^https?:/iu.test(target)) return INLINE.test(target)
    const name = target.split('/').pop()?.toLowerCase() ?? target.toLowerCase()
    return Boolean(snapshot?.assets.some((asset) => asset.name.toLowerCase() === name))
  }

  return false
}
