# Test files

Every file here is generated. None of them are personal files.

- `test-pattern.mp4`: 3 seconds of FFmpeg's test pattern, 320×240 at 15 fps,
  H.264, 15 KB. Made with ffmpeg.wasm (FFmpeg n5.1.4):

  ```
  ffmpeg -f lavfi -i testsrc=duration=3:size=320x240:rate=15 \
    -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
    -metadata title="Tuls test pattern" test-pattern.mp4
  ```
