import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadCsv } from '../exportCsv'

describe('downloadCsv', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    // jsdom doesn't implement object URLs — stub just enough for the download flow.
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
    clickSpy = vi.fn()
    HTMLAnchorElement.prototype.click = clickSpy as unknown as typeof HTMLAnchorElement.prototype.click
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('escapes commas, quotes, and newlines per RFC 4180', async () => {
    let capturedBlob: Blob | undefined
    createObjectURL.mockImplementation((blob: Blob) => {
      capturedBlob = blob
      return 'blob:mock-url'
    })

    downloadCsv('test.csv', ['A', 'B'], [['has,comma', 'has"quote'], ['line\nbreak', 5]])

    expect(capturedBlob).toBeDefined()
    const text = await capturedBlob!.text()
    expect(text).toBe('A,B\r\n"has,comma","has""quote"\r\n"line\nbreak",5')
  })

  it('triggers a click on a temporary anchor and revokes the object URL', () => {
    downloadCsv('test.csv', ['A'], [['x']])
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
