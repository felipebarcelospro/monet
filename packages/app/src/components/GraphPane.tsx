import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { bridge } from '../lib/bridge'
import { useT } from '../hooks/useT'
import { tagTone, readingMinutes } from '../lib/notes'
import { useStore } from '../state/store'
import type { GraphData } from '../shared/contract'
import { MenuButton, MenuItem, MenuLabel } from './Menu'

interface NodeDatum extends SimulationNodeDatum {
  id: string
  title: string
  degree: number
  tags: string[]
  folder: string
}

interface LinkDatum extends SimulationLinkDatum<NodeDatum> {
  source: NodeDatum | string
  target: NodeDatum | string
}

interface Layout {
  nodes: NodeDatum[]
  links: { source: NodeDatum; target: NodeDatum }[]
}

interface View {
  x: number
  y: number
  k: number
}

/**
 * Lays the notes out with a force simulation.
 *
 * d3-force starts from a deterministic phyllotaxis spiral, so the same vault
 * always draws the same map. The number of ticks shrinks as the graph grows
 * to keep large vaults responsive.
 */
function computeLayout(graph: GraphData): Layout {
  const nodes: NodeDatum[] = graph.nodes.map((node) => ({ ...node }))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const links: LinkDatum[] = graph.edges
    .filter((edge) => byId.has(edge.source) && byId.has(edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target }))

  const simulation = forceSimulation<NodeDatum>(nodes)
    .force(
      'link',
      forceLink<NodeDatum, LinkDatum>(links)
        .id((node) => node.id)
        .distance(42)
        .strength(0.5),
    )
    .force('charge', forceManyBody<NodeDatum>().strength(-120).distanceMax(520))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<NodeDatum>(6))
    .stop()

  const ticks = nodes.length > 900 ? 90 : nodes.length > 400 ? 150 : 260
  simulation.tick(ticks)

  return {
    nodes,
    links: links.map((link) => ({
      source: link.source as NodeDatum,
      target: link.target as NodeDatum,
    })),
  }
}

/** The radius of a node, from how connected it is. */
function radiusOf(node: NodeDatum): number {
  return Math.min(12, 3 + Math.sqrt(node.degree) * 1.25)
}

/** The colours the canvas draws with, read from the active theme. */
function readPalette(): {
  ink: string
  ink3: string
  line: string
  accent: string
  surface: string
  node: string
} {
  const style = getComputedStyle(document.documentElement)
  const value = (name: string): string => style.getPropertyValue(name).trim()
  return {
    ink: value('--ink'),
    ink3: value('--ink-3'),
    line: value('--line-strong'),
    accent: value('--accent'),
    surface: value('--surface'),
    node: value('--ink-2'),
  }
}

/** The graph workspace: a force-directed map of every link in the vault. */
export function GraphPane(): React.JSX.Element {
  const t = useT()
  const snapshot = useStore((state) => state.snapshot)
  const selectNote = useStore((state) => state.selectNote)
  const setView = useStore((state) => state.setView)
  const theme = useStore((state) => state.prefs.theme)

  const [graph, setGraph] = useState<GraphData | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, k: 1 })
  const fittedRef = useRef(false)
  const dragRef = useRef<{ x: number; y: number; moved: boolean; start: View } | null>(null)
  const drawRef = useRef<() => void>(() => {})

  const notesKey = `${snapshot?.stats.notes ?? 0}:${snapshot?.stats.links ?? 0}`

  useEffect(() => {
    let cancelled = false
    void bridge.graph().then((data) => {
      if (!cancelled) setGraph(data)
    })
    return () => {
      cancelled = true
    }
  }, [notesKey])

  const filtered = useMemo<GraphData | null>(() => {
    if (!graph) return null
    if (!tagFilter) return graph
    const allowed = new Set(
      graph.nodes
        .filter((node) => node.tags.some((tag) => tag.toLowerCase() === tagFilter.toLowerCase()))
        .map((node) => node.id),
    )
    return {
      nodes: graph.nodes.filter((node) => allowed.has(node.id)),
      edges: graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target)),
    }
  }, [graph, tagFilter])

  const layout = useMemo<Layout | null>(
    () => (filtered ? computeLayout(filtered) : null),
    [filtered],
  )

  const nodeById = useMemo(() => {
    const map = new Map<string, NodeDatum>()
    layout?.nodes.forEach((node) => map.set(node.id, node))
    return map
  }, [layout])

  // Fit the map to the window the first time it is laid out.
  const fit = useCallback(() => {
    if (!layout || layout.nodes.length === 0 || size.width === 0) return
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const node of layout.nodes) {
      const x = node.x ?? 0
      const y = node.y ?? 0
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    const spanX = Math.max(1, maxX - minX) + 120
    const spanY = Math.max(1, maxY - minY) + 120
    const k = Math.min(2.2, Math.max(0.2, Math.min(size.width / spanX, size.height / spanY)))
    viewRef.current = {
      k,
      x: size.width / 2 - ((minX + maxX) / 2) * k,
      y: size.height / 2 - ((minY + maxY) / 2) * k,
    }
    fittedRef.current = true
    drawRef.current()
  }, [layout, size])

  useEffect(() => {
    fittedRef.current = false
  }, [layout])

  useEffect(() => {
    if (!fittedRef.current) fit()
  }, [fit])

  // Keep the canvas sized to its container.
  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight })
    })
    observer.observe(element)
    setSize({ width: element.clientWidth, height: element.clientHeight })
    return () => observer.disconnect()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !layout) return
    const context = canvas.getContext('2d')
    if (!context) return

    const dpr = window.devicePixelRatio || 1
    const width = size.width
    const height = size.height
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }

    const palette = readPalette()
    const { x, y, k } = viewRef.current
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)

    const toScreen = (node: NodeDatum): [number, number] => [
      (node.x ?? 0) * k + x,
      (node.y ?? 0) * k + y,
    ]

    const linked = new Set<string>()
    if (selected) {
      linked.add(selected)
      for (const link of layout.links) {
        if (link.source.id === selected) linked.add(link.target.id)
        if (link.target.id === selected) linked.add(link.source.id)
      }
    }

    context.lineCap = 'round'
    for (const link of layout.links) {
      const [x1, y1] = toScreen(link.source)
      const [x2, y2] = toScreen(link.target)
      const active =
        selected !== null && (link.source.id === selected || link.target.id === selected)
      context.beginPath()
      context.moveTo(x1, y1)
      context.lineTo(x2, y2)
      context.strokeStyle = active ? palette.accent : palette.line
      context.globalAlpha = active ? 0.75 : selected ? 0.22 : 0.55
      context.lineWidth = active ? 1.2 : 0.8
      context.stroke()
    }
    context.globalAlpha = 1

    for (const node of layout.nodes) {
      const [sx, sy] = toScreen(node)
      const radius = radiusOf(node)
      const isSelected = node.id === selected
      const isHovered = node.id === hovered
      const dimmed = selected !== null && !linked.has(node.id)

      context.globalAlpha = dimmed ? 0.28 : 1
      context.beginPath()
      context.arc(sx, sy, radius, 0, Math.PI * 2)
      context.fillStyle = isSelected ? palette.accent : isHovered ? palette.ink : palette.node
      context.fill()

      if (isSelected) {
        context.beginPath()
        context.arc(sx, sy, radius + 4, 0, Math.PI * 2)
        context.strokeStyle = palette.accent
        context.globalAlpha = 0.35
        context.lineWidth = 2
        context.stroke()
      }
    }
    context.globalAlpha = 1

    // Labels: the most connected notes, plus whatever the pointer touches.
    const labelled = new Set<string>()
    if (k > 0.55) {
      const top = [...layout.nodes].sort((a, b) => b.degree - a.degree).slice(0, k > 1 ? 60 : 24)
      top.forEach((node) => labelled.add(node.id))
    }
    if (selected) labelled.add(selected)
    if (hovered) labelled.add(hovered)

    context.font = '500 11px "Inter Variable", -apple-system, sans-serif'
    context.textBaseline = 'middle'
    for (const node of layout.nodes) {
      if (!labelled.has(node.id)) continue
      const [sx, sy] = toScreen(node)
      const label = node.title
      const tx = sx + radiusOf(node) + 5
      context.lineWidth = 3.5
      context.strokeStyle = palette.surface
      context.strokeText(label, tx, sy)
      context.fillStyle = node.id === selected ? palette.accent : palette.ink
      context.fillText(label, tx, sy)
    }
  }, [layout, selected, hovered, size])

  useEffect(() => {
    drawRef.current = draw
    draw()
  }, [draw, theme])

  const hitTest = useCallback(
    (clientX: number, clientY: number): NodeDatum | null => {
      if (!layout) return null
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return null
      const { x, y, k } = viewRef.current
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      let best: NodeDatum | null = null
      let bestDistance = Infinity
      for (const node of layout.nodes) {
        const nx = (node.x ?? 0) * k + x
        const ny = (node.y ?? 0) * k + y
        const distance = Math.hypot(nx - sx, ny - sy)
        const reach = radiusOf(node) + 5
        if (distance <= reach && distance < bestDistance) {
          best = node
          bestDistance = distance
        }
      }
      return best
    },
    [layout],
  )

  useEffect(() => {
    if (selected && !nodeById.has(selected)) setSelected(null)
  }, [nodeById, selected])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const sx = event.clientX - rect.left
      const sy = event.clientY - rect.top
      const view = viewRef.current
      const factor = Math.exp(-event.deltaY * 0.0015)
      const k = Math.min(4, Math.max(0.12, view.k * factor))
      const ratio = k / view.k
      viewRef.current = {
        k,
        x: sx - (sx - view.x) * ratio,
        y: sy - (sy - view.y) * ratio,
      }
      drawRef.current()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const tags = snapshot?.tags ?? []
  const stats = filtered
    ? { notes: filtered.nodes.length, links: filtered.edges.length }
    : { notes: 0, links: 0 }
  const selectedNode = selected ? nodeById.get(selected) : undefined
  const selectedSummary = selectedNode
    ? snapshot?.notes.find((note) => note.id === selectedNode.id)
    : undefined

  const empty = !filtered || filtered.nodes.length === 0

  return (
    <div className="graph-pane" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        style={{ cursor: hovered ? 'pointer' : 'grab' }}
        onPointerDown={(event) => {
          const view = viewRef.current
          dragRef.current = { x: event.clientX, y: event.clientY, moved: false, start: { ...view } }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (drag) {
            const dx = event.clientX - drag.x
            const dy = event.clientY - drag.y
            if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
            if (drag.moved) {
              viewRef.current = { ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy }
              drawRef.current()
            }
            return
          }
          const node = hitTest(event.clientX, event.clientY)
          const id = node?.id ?? null
          if (id !== hovered) setHovered(id)
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          dragRef.current = null
          if (drag && !drag.moved) {
            const node = hitTest(event.clientX, event.clientY)
            setSelected(node?.id ?? null)
          }
        }}
        onPointerLeave={() => setHovered(null)}
        onDoubleClick={(event) => {
          const node = hitTest(event.clientX, event.clientY)
          if (node) {
            void selectNote(node.id)
            setView('editor')
          }
        }}
      />

      <div className="graph-hud">
        <div className="graph-stats">
          <span>{t('graph.notes', { count: stats.notes })}</span>
          <span className="divider" />
          <span>{t('graph.links', { count: stats.links })}</span>
        </div>

        <div className="graph-tools">
          <MenuButton
            align="left"
            trigger={({ toggle }) => (
              <button type="button" className="tool" onClick={toggle}>
                #{tagFilter ?? t('graph.allTags')}
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>{t('graph.filter')}</MenuLabel>
                <MenuItem
                  selected={tagFilter === null}
                  onSelect={() => {
                    setTagFilter(null)
                    setSelected(null)
                    fittedRef.current = false
                    close()
                  }}
                >
                  {t('graph.allTags')}
                </MenuItem>
                {tags.slice(0, 24).map((item) => (
                  <MenuItem
                    key={item.tag}
                    selected={tagFilter === item.tag}
                    onSelect={() => {
                      setTagFilter(item.tag)
                      setSelected(null)
                      fittedRef.current = false
                      close()
                    }}
                  >
                    <span className={`chip tone-${tagTone(item.tag)}`} style={{ height: 17 }}>
                      {item.tag}
                    </span>
                    <span style={{ marginLeft: 'auto', color: 'var(--ink-4)' }}>{item.count}</span>
                  </MenuItem>
                ))}
              </>
            )}
          </MenuButton>

          <button
            type="button"
            className="tool"
            aria-label={t('graph.reset')}
            title={t('graph.reset')}
            onClick={() => {
              fittedRef.current = false
              fit()
            }}
          >
            <RotateCcw size={12} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {selectedNode ? (
        <div className="graph-details">
          <div className="details-title">{selectedNode.title}</div>
          <div className="details-meta">
            <span>{t('graph.links', { count: selectedNode.degree })}</span>
            {selectedSummary ? (
              <span>
                {t('editor.readingTime', { count: readingMinutes(selectedSummary.wordCount) })}
              </span>
            ) : null}
          </div>
          {selectedNode.tags.length > 0 ? (
            <div className="details-tags">
              {selectedNode.tags.slice(0, 4).map((tag) => (
                <span key={tag} className={`chip tone-${tagTone(tag)}`}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="details-open"
            onClick={() => {
              void selectNote(selectedNode.id)
              setView('editor')
            }}
          >
            {t('graph.open')}
          </button>
        </div>
      ) : null}

      {empty ? (
        <div className="graph-empty">
          <div className="graph-empty-title">{t('graph.empty.title')}</div>
          <div className="graph-empty-body">{t('graph.empty.body')}</div>
        </div>
      ) : (
        <div className="graph-hint">{t('graph.hint')}</div>
      )}
    </div>
  )
}
