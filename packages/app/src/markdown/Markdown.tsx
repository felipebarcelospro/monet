import { ArrowUpRight, FileText, FolderOpen, Link2, TriangleAlert } from 'lucide-react'
import { createContext, useContext, useEffect, useId, useMemo, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { useT } from '../hooks/useT'
import { bridge } from '../lib/bridge'
import { useStore } from '../state/store'
import type { AssetSummary, NoteSummary } from '../shared/contract'
import { resolveTarget } from './resolve'
import { remarkCallouts } from './callouts'
import { remarkLiftMedia } from './liftMedia'
import { remarkWikilinks } from './wikilinks'

/** What every node of a rendered note needs to know about its vault. */
interface MarkdownContextValue {
  notePath: string
  notes: NoteSummary[]
  assets: AssetSummary[]
  depth: number
  openNote: (id: string, heading?: string) => void
}

const MarkdownContext = createContext<MarkdownContextValue>({
  notePath: '',
  notes: [],
  assets: [],
  depth: 0,
  openNote: () => {},
})

/** Safe HTML schema allowing callouts, tables, wikilinks, and math classes while stripping scripts & event handlers. */
const sanitizeSchema: typeof defaultSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'details',
    'summary',
    'video',
    'audio',
    'source',
    'mark',
    'kbd',
    'del',
    'ins',
    'sub',
    'sup',
    'span',
  ],
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.['href'] ?? []), 'monet-note', 'monet-embed'],
    src: [...(defaultSchema.protocols?.['src'] ?? []), 'monet'],
  },
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      'className',
      'class',
      'id',
      'ariaLabel',
      'ariaHidden',
    ],
    video: ['src', 'controls', 'loop', 'muted', 'poster', 'width', 'height'],
    audio: ['src', 'controls', 'loop', 'muted'],
    source: ['src', 'type'],
    input: ['type', 'checked', 'disabled', 'readOnly', 'className', 'class'],
  },
}

/** Renders a note body as reading-quality Markdown. */
export function Markdown({
  source,
  notePath = '',
  notes,
  assets,
  depth = 0,
  className = '',
}: {
  source: string
  notePath?: string
  notes?: NoteSummary[]
  assets?: AssetSummary[]
  depth?: number
  className?: string
}): React.JSX.Element {
  const snapshot = useStore((state) => state.snapshot)
  const selectNote = useStore((state) => state.selectNote)

  const value = useMemo<MarkdownContextValue>(
    () => ({
      notePath,
      notes: notes ?? snapshot?.notes ?? [],
      assets: assets ?? snapshot?.assets ?? [],
      depth,
      openNote: (id: string, heading?: string) => {
        void selectNote(id).then(() => {
          if (!heading) return
          // The note has to be on screen before the heading can be found.
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('monet:open-heading', { detail: heading }))
          }, 80)
        })
      },
    }),
    [notePath, notes, assets, depth, selectNote, snapshot],
  )

  return (
    <MarkdownContext.Provider value={value}>
      <div className={`markdown-body ${className}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath, remarkCallouts, remarkWikilinks, remarkLiftMedia]}
          rehypePlugins={[
            rehypeRaw,
            [rehypeSanitize, sanitizeSchema],
            rehypeKatex,
            [rehypeHighlight, { detect: true, ignoreMissing: true }],
          ]}
          urlTransform={(url) =>
            url.startsWith('monet-note:') || url.startsWith('monet-embed:')
              ? url
              : defaultUrlTransform(url)
          }
          components={components}
        >
          {source}
        </ReactMarkdown>
      </div>
    </MarkdownContext.Provider>
  )
}

const components: Components = {
  a({ href, children, ...props }) {
    return <Anchor href={href}>{children}</Anchor>
  },
  img({ src, alt }) {
    return <ImageSource src={src ?? ''} alt={alt ?? ''} />
  },
  pre({ children }) {
    return <Pre>{children}</Pre>
  },
  table({ children }) {
    return (
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    )
  },
  input({ type, checked, ...props }) {
    if (type !== 'checkbox') return <input type={type} checked={checked} {...props} />
    return <input type="checkbox" checked={checked} readOnly tabIndex={-1} className="task-box" />
  },
}

/** A link: internal notes open in place, external ones in the browser. */
function Anchor({
  href,
  children,
}: {
  href?: string
  children: React.ReactNode
}): React.JSX.Element {
  const context = useContext(MarkdownContext)

  if (href?.startsWith('monet-note:')) {
    const target = decodeURIComponent(href.slice('monet-note:'.length))

    // `[[#Heading]]` points inside the note that contains the link.
    if (target.startsWith('#')) {
      return (
        <a
          href={href}
          className="wikilink internal"
          onClick={(event) => {
            event.preventDefault()
            context.openNote(context.notePath.replace(/\.md$/u, ''), target.slice(1))
          }}
        >
          {children}
        </a>
      )
    }

    const resolved = resolveTarget(target, context.notePath, context.assets, context.notes)
    const label = children
    if (resolved.kind === 'note') {
      return (
        <a
          href={href}
          className="wikilink internal"
          onClick={(event) => {
            event.preventDefault()
            context.openNote(resolved.id, target.split('#')[1])
          }}
        >
          {label}
        </a>
      )
    }
    if (resolved.kind === 'external') {
      return (
        <a href={resolved.url} target="_blank" rel="noreferrer" className="wikilink">
          {label}
        </a>
      )
    }
    if (resolved.kind === 'file') {
      return <Attachment path={resolved.path} label={typeof label === 'string' ? label : target} />
    }
    return <span className="wikilink missing">{label}</span>
  }

  if (href?.startsWith('monet-embed:')) {
    const target = decodeURIComponent(href.slice('monet-embed:'.length))
    return <Embed target={target} />
  }

  const external = /^https?:/iu.test(href ?? '')
  if (external) {
    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault()
          window.open(href, '_blank', 'noopener')
        }}
      >
        {children}
      </a>
    )
  }

  if (href && /\.(pdf|docx?|xlsx?|pptx?|zip|csv|key|pages|numbers)$/iu.test(href)) {
    return <Attachment path={href} label={typeof children === 'string' ? children : href} />
  }

  return (
    <a
      href={href}
      onClick={(event) => {
        // A relative link to a file that is not a note: let the main process
        // open it with the user's own application.
        event.preventDefault()
        const path = decodeURIComponent(href ?? '')
        void bridge.openAsset(path).catch(() => {
          useStore.getState().showToast(path, 'error')
        })
      }}
    >
      {children}
    </a>
  )
}

/** An image, video or audio file, with the note's own folder as the base. */
function ImageSource({ src, alt }: { src: string; alt: string }): React.JSX.Element {
  const context = useContext(MarkdownContext)

  if (src.startsWith('monet-embed:')) {
    return <Embed target={decodeURIComponent(src.slice('monet-embed:'.length))} />
  }
  if (src.startsWith('monet-note:')) {
    return <Embed target={decodeURIComponent(src.slice('monet-note:'.length))} />
  }

  const resolved = resolveTarget(src, context.notePath, context.assets, context.notes)
  if (resolved.kind === 'external' && /\.(png|jpe?g|gif|webp|avif|svg)$/iu.test(resolved.url)) {
    return <Figure src={resolved.url} alt={alt} />
  }
  if (resolved.kind === 'image') return <Figure src={resolved.url} alt={alt} path={resolved.path} />
  if (resolved.kind === 'video') {
    return (
      <figure className="media-block">
        <video controls preload="metadata" src={resolved.url} />
        {alt ? <figcaption>{alt}</figcaption> : null}
      </figure>
    )
  }
  if (resolved.kind === 'audio') {
    return (
      <figure className="media-block audio-block">
        <audio controls preload="metadata" src={resolved.url} />
        {alt ? <figcaption>{alt}</figcaption> : null}
      </figure>
    )
  }
  if (resolved.kind === 'file')
    return <Attachment path={resolved.path} label={alt || resolved.path} />
  if (resolved.kind === 'note') return <Embed target={resolved.id} />
  if (resolved.kind === 'external') return <Figure src={resolved.url} alt={alt} />
  return (
    <span className="missing-media">
      <FileText size={13} strokeWidth={1.7} /> {alt || resolved.target}
    </span>
  )
}

/** A figure with an optional caption, framed like a plate in a book. */
function Figure({
  src,
  alt,
  path,
}: {
  src: string
  alt: string
  path?: string
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className="missing-media">
        <FileText size={13} strokeWidth={1.7} /> {path ?? alt}
      </span>
    )
  }
  return (
    <figure className="media-figure">
      <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      {alt ? <figcaption>{alt}</figcaption> : null}
    </figure>
  )
}

/** A card for any non-media file: click opens it in its own application. */
function Attachment({ path, label }: { path: string; label: string }): React.JSX.Element {
  const extension = path.split('.').pop()?.toUpperCase() ?? 'FILE'
  return (
    <button
      type="button"
      className="attachment"
      title={path}
      onClick={() => {
        void bridge.openAsset(path).catch((error: unknown) => {
          useStore.getState().showToast(error instanceof Error ? error.message : path, 'error')
        })
      }}
    >
      <span className="attachment-icon">
        <FileText size={15} strokeWidth={1.7} />
      </span>
      <span className="attachment-name">{label}</span>
      <span className="attachment-ext">{extension}</span>
      <FolderOpen size={13} strokeWidth={1.7} className="attachment-open" />
    </button>
  )
}

/**
 * An embed: `![[Note]]` shows the note itself, `![[image.png]]` the image.
 *
 * A note embed reads the body on demand and stops at one level, so a vault
 * with notes that embed each other cannot recurse forever.
 */
function Embed({ target }: { target: string }): React.JSX.Element {
  const t = useT()
  const context = useContext(MarkdownContext)
  const resolved = resolveTarget(target, context.notePath, context.assets, context.notes)
  const [body, setBody] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const noteId = resolved.kind === 'note' ? resolved.id : null
  const shallow = context.depth >= 1

  useEffect(() => {
    if (!noteId || shallow) return
    let cancelled = false
    void bridge
      .readNote(noteId)
      .then((document) => {
        if (!cancelled) setBody(document?.body ?? '')
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [noteId, shallow])

  if (resolved.kind === 'image') return <Figure src={resolved.url} alt="" />
  if (resolved.kind === 'video') {
    return (
      <figure className="media-block">
        <video controls preload="metadata" src={resolved.url} />
      </figure>
    )
  }
  if (resolved.kind === 'audio') {
    return (
      <figure className="media-block audio-block">
        <audio controls preload="metadata" src={resolved.url} />
      </figure>
    )
  }
  if (resolved.kind === 'file')
    return (
      <Attachment path={resolved.path} label={resolved.path.split('/').pop() ?? resolved.path} />
    )
  if (resolved.kind === 'missing') {
    return (
      <span className="embed-card missing">
        <Link2 size={13} strokeWidth={1.7} /> {resolved.target}
      </span>
    )
  }
  if (resolved.kind === 'external') {
    return (
      <a href={resolved.url} target="_blank" rel="noreferrer" className="embed-card">
        <Link2 size={13} strokeWidth={1.7} /> {resolved.url}
      </a>
    )
  }

  // A note.
  return (
    <div className="embed-card note-embed">
      <button type="button" className="embed-head" onClick={() => context.openNote(resolved.id)}>
        <FileText size={12} strokeWidth={1.8} />
        {resolved.title}
        <ArrowUpRight size={12} strokeWidth={1.8} className="embed-open" />
      </button>
      {failed ? (
        <div className="embed-body muted">{t('markdown.embedError')}</div>
      ) : body === null ? (
        <div className="embed-body muted">…</div>
      ) : shallow ? (
        <button
          type="button"
          className="embed-body muted as-button"
          onClick={() => context.openNote(resolved.id)}
        >
          {resolved.title}
        </button>
      ) : (
        <div className="embed-body">
          <Markdown
            source={body}
            notePath={resolved.id}
            notes={context.notes}
            assets={context.assets}
            depth={context.depth + 1}
          />
        </div>
      )}
    </div>
  )
}

/** A fenced block: Mermaid becomes a diagram, everything else stays code. */
function Pre({ children }: { children?: React.ReactNode }): React.JSX.Element {
  const child = Array.isArray(children) ? children[0] : children
  const props = (child as { props?: { className?: string; children?: React.ReactNode } } | null)
    ?.props
  const language = /language-([\w-]+)/u.exec(props?.className ?? '')?.[1]
  const code = String(props?.children ?? '').replace(/\n$/u, '')

  if (language === 'mermaid') return <Mermaid code={code} />
  if (language === 'video' && /^(?:monet:|https?:)/iu.test(code.trim())) {
    return (
      <figure className="media-block">
        <video controls preload="metadata" src={code.trim()} />
      </figure>
    )
  }
  return (
    <div className="code-block">
      {language ? <span className="code-language">{language}</span> : null}
      <pre>{children}</pre>
    </div>
  )
}

let mermaidLoader: Promise<typeof import('mermaid').default> | null = null

/** Loads Mermaid once, lazily: it is a large dependency. */
async function loadMermaid(): Promise<typeof import('mermaid').default> {
  mermaidLoader ??= import('mermaid').then((module) => {
    const mermaid = module.default
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: '"Inter Variable", -apple-system, sans-serif',
      themeVariables: {
        background: '#ffffff',
        primaryColor: '#f3f1ec',
        primaryTextColor: '#22201c',
        primaryBorderColor: '#c9c4b9',
        lineColor: '#8a8477',
        secondaryColor: '#eef1f8',
        tertiaryColor: '#faf9f6',
        fontSize: '14px',
        actorBkg: '#f3f1ec',
        actorBorder: '#c9c4b9',
        actorTextColor: '#22201c',
        signalColor: '#8a8477',
        signalTextColor: '#22201c',
        labelBoxBkgColor: '#f3f1ec',
        labelBoxBorderColor: '#c9c4b9',
        labelTextColor: '#22201c',
        noteBkgColor: '#faf9f6',
        noteBorderColor: '#d9d5c9',
        noteTextColor: '#2a2924',
      },
      flowchart: { curve: 'basis', padding: 12 },
      sequence: { actorMargin: 36, messageFontSize: 12 },
    })
    return mermaid
  })
  return mermaidLoader
}

/** A diagram drawn from a Mermaid code fence. */
function Mermaid({ code }: { code: string }): React.JSX.Element {
  const t = useT()
  const raw = useId()
  const id = `mermaid-${raw.replace(/[^a-zA-Z0-9]/gu, '')}`
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSvg('')
    setError(null)
    void loadMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then((result) => {
        if (!cancelled) setSvg(result.svg)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [code, id])

  if (error) {
    return (
      <div className="mermaid-error">
        <TriangleAlert size={13} strokeWidth={1.7} /> {t('markdown.mermaidError')}:{' '}
        {error.split('\n')[0]}
        <pre>{code}</pre>
      </div>
    )
  }

  return (
    <figure
      className="mermaid"
      aria-label="Diagrama"
      // Mermaid produces trusted SVG from the note itself.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
