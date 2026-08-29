import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElapsedSeconds } from '../useElapsedSeconds'

describe('useElapsedSeconds', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at 0 for a start time of now', () => {
    const { result } = renderHook(() => useElapsedSeconds('2026-01-01T00:00:00Z'))
    expect(result.current).toBe(0)
  })

  it('climbs once a second as real time advances', () => {
    const { result } = renderHook(() => useElapsedSeconds('2026-01-01T00:00:00Z'))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current).toBe(3)
  })

  it('never goes negative for a start time in the future', () => {
    const { result } = renderHook(() => useElapsedSeconds('2026-01-01T00:05:00Z'))
    expect(result.current).toBe(0)
  })
})
