import { ArrowLeft, ArrowRight, PanelLeft } from 'lucide-react'

import { useT } from '../hooks/useT'
import { bridge } from '../lib/bridge'
import { useStore } from '../state/store'

/** The three window controls, drawn by the app because the window is frameless. */
export function TrafficLights(): React.JSX.Element {
  const t = useT()

  return (
    <div className="traffic">
      <button
        type="button"
        className="traffic-dot close"
        aria-label={t('menu.closeWindow')}
        onClick={() => void bridge.closeWindow()}
      >
        <span aria-hidden="true">×</span>
      </button>
      <button
        type="button"
        className="traffic-dot minimize"
        aria-label={t('menu.minimize')}
        onClick={() => void bridge.minimize()}
      >
        <span aria-hidden="true">−</span>
      </button>
      <button
        type="button"
        className="traffic-dot zoom"
        aria-label={t('menu.zoom')}
        onClick={() => void bridge.zoomWindow()}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  )
}

/** The sidebar toggle, the history buttons, and the traffic lights. */
export function WindowChrome({ inline = false }: { inline?: boolean }): React.JSX.Element {
  const t = useT()
  const history = useStore((state) => state.history)
  const historyIndex = useStore((state) => state.historyIndex)
  const goBack = useStore((state) => state.goBack)
  const goForward = useStore((state) => state.goForward)
  const toggleSidebar = useStore((state) => state.toggleSidebar)

  return (
    <>
      {inline ? <TrafficLights /> : null}
      <button
        type="button"
        className="icon-button"
        aria-label={t('nav.toggleSidebar')}
        title={t('nav.toggleSidebar')}
        onClick={toggleSidebar}
      >
        <PanelLeft size={15} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('nav.back')}
        title={t('nav.back')}
        disabled={historyIndex <= 0}
        onClick={goBack}
      >
        <ArrowLeft size={15} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('nav.forward')}
        title={t('nav.forward')}
        disabled={historyIndex >= history.length - 1}
        onClick={goForward}
      >
        <ArrowRight size={15} strokeWidth={1.7} />
      </button>
    </>
  )
}
