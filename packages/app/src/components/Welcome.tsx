import { FolderClosed, FolderOpen, Settings2 } from 'lucide-react'

import { useT } from '../hooks/useT'
import { EMPTY_LIST, useStore } from '../state/store'
import { TrafficLights } from './Chrome'

/** The first screen, shown when no vault is open. */
export function Welcome(): React.JSX.Element {
  const t = useT()
  const recent = useStore((state) => state.info?.recentVaults ?? EMPTY_LIST)
  const openVaultDialog = useStore((state) => state.openVaultDialog)
  const createVaultDialog = useStore((state) => state.createVaultDialog)
  const openVaultPath = useStore((state) => state.openVaultPath)
  const openSettings = useStore((state) => state.openSettings)

  return (
    <div className="welcome">
      <div className="welcome-top">
        <TrafficLights />
        <button
          type="button"
          className="icon-button"
          style={{ marginLeft: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          aria-label={t('nav.settings')}
          title={t('nav.settings')}
          onClick={openSettings}
        >
          <Settings2 size={15} strokeWidth={1.7} />
        </button>
      </div>

      <div className="welcome-main">
        <div className="welcome-grid">
          <div>
            <div className="welcome-eyebrow">
              <span className="rule" />
              {t('welcome.eyebrow')}
            </div>
            <h1 className="welcome-title">{t('welcome.title')}</h1>
            <p className="welcome-sub">{t('welcome.subtitle')}</p>

            <div className="welcome-actions">
              <button
                type="button"
                className="button button-accent"
                onClick={() => void openVaultDialog()}
              >
                <FolderOpen size={14} strokeWidth={1.8} />
                {t('welcome.open')}
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void createVaultDialog()}
              >
                {t('welcome.create')}
              </button>
            </div>

            <div className="welcome-recent">
              <div className="welcome-recent-title">{t('welcome.recent')}</div>
              {recent.length === 0 ? (
                <div className="recent-empty">{t('welcome.emptyRecent')}</div>
              ) : (
                recent.slice(0, 4).map((path) => (
                  <button
                    key={path}
                    type="button"
                    className="recent-row"
                    onClick={() => void openVaultPath(path)}
                  >
                    <FolderClosed className="recent-icon" size={14} strokeWidth={1.7} />
                    <span className="recent-name">{path.split('/').pop() ?? path}</span>
                    <span className="recent-path">{path}</span>
                  </button>
                ))
              )}
            </div>

            <div className="welcome-hint">{t('welcome.hint')}</div>
          </div>

          <div className="welcome-art" aria-hidden="true">
            <div className="paper-card graph-card">
              <div className="dot-grid" />
              <GraphIllustration />
              <span className="graph-caption">
                {t('graph.notes', { count: 128 })} · {t('graph.links', { count: 412 })}
              </span>
            </div>
            <div className="paper-card note-card">
              <div className="note-card-eyebrow">{t('welcome.eyebrow')}</div>
              <div className="note-card-title">{t('app.tagline')}</div>
              <div className="note-card-lines">
                <span />
                <span />
                <span />
              </div>
              <div className="note-card-links">
                <span>#</span>
                <span>#</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A small, static drawing of a link graph. */
function GraphIllustration(): React.JSX.Element {
  const nodes: [number, number, number][] = [
    [56, 72, 4],
    [118, 40, 3],
    [182, 92, 6],
    [240, 52, 3],
    [276, 130, 4],
    [212, 176, 3],
    [144, 170, 5],
    [72, 196, 3],
    [30, 140, 3],
    [104, 120, 9],
    [168, 226, 3],
    [262, 236, 4],
  ]
  const edges: [number, number][] = [
    [0, 9],
    [1, 9],
    [2, 9],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 9],
    [7, 6],
    [8, 9],
    [9, 6],
    [10, 6],
    [11, 5],
    [5, 4],
    [2, 5],
    [6, 5],
    [3, 4],
  ]
  return (
    <svg viewBox="0 0 320 270" preserveAspectRatio="xMidYMid meet">
      {edges.map(([a, b], index) => (
        <line
          key={index}
          x1={nodes[a]![0]}
          y1={nodes[a]![1]}
          x2={nodes[b]![0]}
          y2={nodes[b]![1]}
          stroke="var(--line-strong)"
          strokeWidth={1}
        />
      ))}
      {nodes.map(([x, y, r], index) => (
        <circle
          key={index}
          cx={x}
          cy={y}
          r={index === 9 ? 7 : r}
          fill={index === 9 ? 'var(--accent)' : 'var(--ink-3)'}
          opacity={index === 9 ? 1 : 0.7}
        />
      ))}
    </svg>
  )
}
