import '@fontsource-variable/inter'
import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/jetbrains-mono'
import 'katex/dist/katex.min.css'
import './styles/tokens.css'
import './styles/app.css'
import './styles/markdown.css'

import { createRoot } from 'react-dom/client'

import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
