import { useEffect, useRef } from 'react'

import type { NoteSummary } from '../shared/contract'
import { useStore } from '../state/store'

interface NodeItem {
  id: string
  title: string
  isCenter: boolean
  x: number
  y: number
  vx: number
  vy: number
}

interface EdgeItem {
  source: string
  target: string
}

export function LocalGraph({
  currentNote,
  incoming,
  outgoing,
}: {
  currentNote: NoteSummary
  incoming: NoteSummary[]
  outgoing: NoteSummary[]
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const selectNote = useStore((state) => state.selectNote)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth || 260
    const height = 150
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)

    const neighborsMap = new Map<string, NoteSummary>()
    incoming.forEach((n) => neighborsMap.set(n.id, n))
    outgoing.forEach((n) => neighborsMap.set(n.id, n))
    const neighbors = [...neighborsMap.values()]

    // Center node
    const nodes: NodeItem[] = [
      {
        id: currentNote.id,
        title: currentNote.title,
        isCenter: true,
        x: width / 2,
        y: height / 2,
        vx: 0,
        vy: 0,
      },
    ]

    // Position neighbours around center in a circle
    const angleStep = neighbors.length > 0 ? (Math.PI * 2) / neighbors.length : 0
    const radius = Math.min(width, height) * 0.38

    neighbors.forEach((n, idx) => {
      const angle = idx * angleStep
      nodes.push({
        id: n.id,
        title: n.title,
        isCenter: false,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      })
    })

    const edges: EdgeItem[] = []
    incoming.forEach((n) => edges.push({ source: n.id, target: currentNote.id }))
    outgoing.forEach((n) => edges.push({ source: currentNote.id, target: n.id }))

    // Draw
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const style = getComputedStyle(document.documentElement)
    const accent = style.getPropertyValue('--accent').trim() || '#D97706'
    const ink = style.getPropertyValue('--ink').trim() || '#1F2937'
    const ink3 = style.getPropertyValue('--ink-3').trim() || '#6B7280'
    const line = style.getPropertyValue('--line-strong').trim() || '#E5E7EB'

    const nodeById = new Map<string, NodeItem>(nodes.map((n) => [n.id, n]))

    // Draw edges
    edges.forEach((e) => {
      const s = nodeById.get(e.source)
      const t = nodeById.get(e.target)
      if (!s || !t) return
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
      ctx.strokeStyle = line
      ctx.lineWidth = 1
      ctx.stroke()
    })

    // Draw nodes
    ctx.font = '500 10px "Inter Variable", -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    nodes.forEach((n) => {
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.isCenter ? 6 : 4, 0, Math.PI * 2)
      ctx.fillStyle = n.isCenter ? accent : ink3
      ctx.fill()

      const label = n.title.length > 14 ? `${n.title.slice(0, 13)}…` : n.title
      ctx.fillStyle = n.isCenter ? accent : ink
      ctx.fillText(label, n.x, n.y + 7)
    })
  }, [currentNote, incoming, outgoing])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Simple hit check on neighbours
    const width = canvas.clientWidth || 260
    const height = 150
    const neighborsMap = new Map<string, NoteSummary>()
    incoming.forEach((n) => neighborsMap.set(n.id, n))
    outgoing.forEach((n) => neighborsMap.set(n.id, n))
    const neighbors = [...neighborsMap.values()]

    const angleStep = neighbors.length > 0 ? (Math.PI * 2) / neighbors.length : 0
    const radius = Math.min(width, height) * 0.38

    for (let i = 0; i < neighbors.length; i += 1) {
      const n = neighbors[i]!
      const angle = i * angleStep
      const nx = width / 2 + Math.cos(angle) * radius
      const ny = height / 2 + Math.sin(angle) * radius
      if (Math.hypot(nx - x, ny - y) < 14) {
        void selectNote(n.id)
        return
      }
    }
  }

  return (
    <div className="local-graph-container" style={{ padding: '8px 14px' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '150px', display: 'block', cursor: 'pointer' }}
        onClick={handleClick}
      />
    </div>
  )
}
