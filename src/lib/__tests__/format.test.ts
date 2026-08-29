import { describe, expect, it, vi } from 'vitest'
import { formatBytes, formatDuration, formatRelativeTime } from '../format'

describe('formatDuration', () => {
  it('pads seconds under 10', () => {
    expect(formatDuration(65)).toBe('1:05')
  })

  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0:00')
  })

  it('handles durations over an hour as raw minutes', () => {
    expect(formatDuration(3661)).toBe('61:01')
  })
})

describe('formatRelativeTime', () => {
  it('reports "just now" for timestamps under a minute old', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
    expect(formatRelativeTime(new Date('2026-01-01T11:59:45Z').toISOString())).toBe('just now')
    vi.useRealTimers()
  })

  it('reports minutes ago under an hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
    expect(formatRelativeTime(new Date('2026-01-01T11:45:00Z').toISOString())).toBe('15m ago')
    vi.useRealTimers()
  })

  it('reports hours ago past an hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
    expect(formatRelativeTime(new Date('2026-01-01T09:00:00Z').toISOString())).toBe('3h ago')
    vi.useRealTimers()
  })
})

describe('formatBytes', () => {
  it('formats bytes under 1KB as B', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('formats KB with one decimal', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats MB with one decimal', () => {
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
