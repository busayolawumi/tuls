import { describe, expect, it } from 'vitest'
import { OcrError, ocrErrorKind } from './errors'

describe('text recognition errors', () => {
  it('sorts what the browser and Tesseract say', () => {
    expect(ocrErrorKind(new TypeError('Failed to fetch'))).toBe('network')
    expect(
      ocrErrorKind(
        'Error: Network error while fetching /engines/tesseract-7.0.0/eng.traineddata.gz. Response code: 404',
      ),
    ).toBe('network')
    expect(
      ocrErrorKind("Failed to execute 'importScripts' on 'WorkerGlobalScope'"),
    ).toBe('network')
    expect(ocrErrorKind('RuntimeError: Aborted(OOM)')).toBe('memory')
    expect(ocrErrorKind(new RangeError('Array buffer allocation failed'))).toBe(
      'memory',
    )
    expect(ocrErrorKind('initialization failed')).toBe('unknown')
    expect(ocrErrorKind(new OcrError('stuck'))).toBe('stuck')
  })
})
