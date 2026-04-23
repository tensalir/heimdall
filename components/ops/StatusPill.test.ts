import { describe, expect, it } from 'vitest'
import { getKanbanLane, getFeedbackLane } from './StatusPill'

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

describe('getFeedbackLane', () => {
  it('puts "Ready for review" Monday status into ready_for_review', () => {
    expect(getFeedbackLane('Ready for review')).toBe('ready_for_review')
    expect(getFeedbackLane('Ready for review', true)).toBe('ready_for_review')
  })

  it('puts "Feedback" status into pending_review when Heimdall has NOT reviewed', () => {
    expect(getFeedbackLane('Feedback')).toBe('pending_review')
    expect(getFeedbackLane('Feedback', false)).toBe('pending_review')
  })

  it('puts "Feedback" status into feedback_given only when Heimdall HAS reviewed', () => {
    expect(getFeedbackLane('Feedback', true)).toBe('feedback_given')
  })

  it('puts other statuses into other', () => {
    expect(getFeedbackLane('Brief WIP')).toBe('other')
    expect(getFeedbackLane(null)).toBe('other')
    expect(getFeedbackLane('')).toBe('other')
  })
})
