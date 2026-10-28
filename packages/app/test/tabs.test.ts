import { describe, expect, it } from 'vitest'
import { useStore } from '../src/state/store'

describe('Tabs & Workspace management', () => {
  it('manages tabs upon note selection and tab closing', async () => {
    // Simulate selecting notes
    useStore.setState({ tabs: ['Note-A', 'Note-B'], selectedId: 'Note-B' })
    expect(useStore.getState().tabs).toEqual(['Note-A', 'Note-B'])

    // Close tab Note-B
    useStore.getState().closeTab('Note-B')
    expect(useStore.getState().tabs).toEqual(['Note-A'])
    expect(useStore.getState().selectedId).toBe('Note-A')
  })
})
