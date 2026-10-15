import { describe, expect, it } from 'vitest'
import { checkVideo, defaultClip, gifFileName, MAX_FILE_SIZE } from './video'

// checkVideo only reads the name, type and size.
const file = (name: string, type: string, size = 1_000_000) =>
  ({ name, type, size }) as File

describe('checkVideo', () => {
  it('accepts the formats browsers can play', () => {
    expect(checkVideo(file('clip.mp4', 'video/mp4'))).toBeUndefined()
    expect(checkVideo(file('clip.webm', 'video/webm'))).toBeUndefined()
    expect(checkVideo(file('IMG_2416.MOV', 'video/quicktime'))).toBeUndefined()
  })

  it('goes by the extension when the browser gives no type', () => {
    expect(checkVideo(file('IMG_2416.mov', ''))).toBeUndefined()
  })

  it('says which videos it can’t open yet', () => {
    expect(checkVideo(file('old.avi', 'video/x-msvideo'))).toBe(
      ".avi videos can't be opened yet. Try an MP4, MOV or WebM.",
    )
  })

  it('says when a file isn’t a video', () => {
    expect(checkVideo(file('notes.txt', 'text/plain'))).toBe(
      "That doesn't look like a video. Try an MP4, MOV or WebM.",
    )
  })

  it('says when a video is too big', () => {
    expect(checkVideo(file('big.mp4', 'video/mp4', MAX_FILE_SIZE + 1))).toBe(
      'That video is 200 MB. Videos can be up to 200 MB.',
    )
  })
})

describe('defaultClip', () => {
  it('is the first 5 seconds, or the whole video if shorter', () => {
    expect(defaultClip(12)).toEqual({ start: 0, end: 5 })
    expect(defaultClip(3.2)).toEqual({ start: 0, end: 3.2 })
  })
})

describe('gifFileName', () => {
  it('is the video’s name with .gif', () => {
    expect(gifFileName('IMG_2416.MOV')).toBe('IMG_2416.gif')
    expect(gifFileName('holiday.clip.mp4')).toBe('holiday.clip.gif')
    expect(gifFileName('no-extension')).toBe('no-extension.gif')
    expect(gifFileName('')).toBe('video.gif')
  })
})
