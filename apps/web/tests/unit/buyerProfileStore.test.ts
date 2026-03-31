import { describe, expect, it } from 'vitest'
import { generateDuplicateName, checkProfileRunCooldown } from '~~/server/utils/boatFinderStore'

describe('generateDuplicateName', () => {
  it('appends " Copy" to the base name', () => {
    expect(generateDuplicateName([], 'Tournament rig')).toBe('Tournament rig Copy')
  })

  it('avoids collisions with existing names', () => {
    expect(generateDuplicateName(['Tournament rig Copy'], 'Tournament rig')).toBe(
      'Tournament rig Copy 2',
    )
  })

  it('increments through multiple collisions', () => {
    const existing = [
      'Tournament rig Copy',
      'Tournament rig Copy 2',
      'Tournament rig Copy 3',
    ]
    expect(generateDuplicateName(existing, 'Tournament rig')).toBe('Tournament rig Copy 4')
  })

  it('handles empty base name gracefully', () => {
    expect(generateDuplicateName([], '')).toBe(' Copy')
  })

  it('first duplicate uses Copy, not Copy 1', () => {
    const result = generateDuplicateName(['Primary profile'], 'Primary profile')
    expect(result).toBe('Primary profile Copy')
  })
})

describe('checkProfileRunCooldown', () => {
  it('returns canRunNow true when lastRunAt is null', () => {
    const result = checkProfileRunCooldown(null)
    expect(result.canRunNow).toBe(true)
    expect(result.nextRunAvailableAt).toBeNull()
  })

  it('returns canRunNow true when last run was more than 24 hours ago', () => {
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const result = checkProfileRunCooldown(longAgo)
    expect(result.canRunNow).toBe(true)
    expect(result.nextRunAvailableAt).toBeNull()
  })

  it('returns canRunNow false when last run was less than 24 hours ago', () => {
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    const result = checkProfileRunCooldown(recent)
    expect(result.canRunNow).toBe(false)
    expect(result.nextRunAvailableAt).toBeTruthy()
  })

  it('returns the correct nextRunAvailableAt timestamp', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const result = checkProfileRunCooldown(twoHoursAgo.toISOString())
    expect(result.canRunNow).toBe(false)
    const expectedNext = new Date(twoHoursAgo.getTime() + 24 * 60 * 60 * 1000)
    const actual = new Date(result.nextRunAvailableAt!)
    // Allow 1 second tolerance for processing
    expect(Math.abs(actual.getTime() - expectedNext.getTime())).toBeLessThan(1000)
  })

  it('returns canRunNow true at exactly 24 hours', () => {
    const exactly24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const result = checkProfileRunCooldown(exactly24h)
    expect(result.canRunNow).toBe(true)
    expect(result.nextRunAvailableAt).toBeNull()
  })
})
