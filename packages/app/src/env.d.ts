import type { MonetApi } from './shared/contract'

declare global {
  interface Window {
    monet?: MonetApi
  }
}

export {}
