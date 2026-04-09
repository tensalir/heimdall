import { describe, expect, it } from 'vitest'
import { getKanbanLane } from './StatusPill'

describe('getKanbanLane', () => {
  it('keeps brief ready / approved items in ready or imported lanes', () => {
    expect(getKanbanLane('Brief ready / approved', 'new')).toBe('ready_for_figma')
    expect(getKanbanLane('Brief ready / approved', 'queued')).toBe('imported')
    expect(getKanbanLane('Brief ready / approved', 'synced')).toBe('imported')
  })

  it('does not leak non-eligible synced items into imported', () => {
    expect(getKanbanLane('Ready for review', 'synced')).toBe('other')
    expect(getKanbanLane('Feedback', 'queued')).toBe('other')
    expect(getKanbanLane('Ready to launch', 'synced')).toBe('other')
  })

  it('still maps exported items to exported', () => {
    expect(getKanbanLane('Exported to Frontify', 'synced')).toBe('exported')
    expect(getKanbanLane('Exported to Frontify', 'new')).toBe('exported')
  })
})
