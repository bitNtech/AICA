import { describe, expect, it } from 'vitest'
import { clamp, makeVoiceLikeSampler, samplesToPath } from '../waveform'

describe('clamp', () => {
  it('leaves in-range values untouched', () => {
    expect(clamp(0.5, -1, 1)).toBe(0.5)
  })

  it('clamps above max', () => {
    expect(clamp(5, -1, 1)).toBe(1)
  })

  it('clamps below min', () => {
    expect(clamp(-5, -1, 1)).toBe(-1)
  })
})

describe('samplesToPath', () => {
  it('returns an empty string for no samples', () => {
    expect(samplesToPath([], 100, 40)).toBe('')
  })

  it('draws a straight line for a single sample', () => {
    const d = samplesToPath([0], 100, 40)
    expect(d).toMatch(/^M 0 20 L 0 20$/)
  })

  it('draws a two-point line without smoothing', () => {
    const d = samplesToPath([-1, 1], 100, 40)
    expect(d.startsWith('M 0')).toBe(true)
    expect(d).toContain('L 100')
  })

  it('produces a quadratic path for three or more samples', () => {
    const d = samplesToPath([0, 1, 0], 100, 40)
    expect(d.startsWith('M')).toBe(true)
    expect(d).toContain('Q')
  })
})

describe('makeVoiceLikeSampler', () => {
  it('always stays within -1..1', () => {
    const sample = makeVoiceLikeSampler()
    for (let i = 0; i < 500; i++) {
      const v = sample()
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
