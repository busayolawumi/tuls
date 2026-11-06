# Test files

Every file here is generated. None of them are personal files.

- `test-pattern.mp4`: 3 seconds of FFmpeg's test pattern, 320×240 at 15 fps,
  H.264, 15 KB. Made with ffmpeg.wasm (FFmpeg n5.1.4):

  ```
  ffmpeg -f lavfi -i testsrc=duration=3:size=320x240:rate=15 \
    -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
    -metadata title="Tuls test pattern" test-pattern.mp4
  ```

- `turned-p3.heic`: 64×48, red on the left half and blue on the right, in
  Display P3, marked to be turned a quarter clockwise (HEIC `irot`), with
  the camera name "TulsTestCam". 1 KB. Made on a Mac with `sips`, from a PNG
  of those two colours:

  ```
  sips -s format jpeg -s formatOptions 95 pattern.png --out p.jpg
  sips --matchTo "/System/Library/ColorSync/Profiles/Display P3.icc" p.jpg --out p3.jpg
  # then EXIF added to p3.jpg after its JFIF segment: Make "TulsTestCam"
  # and Orientation 6, saved as turned.jpg
  sips -s format heic turned.jpg --out turned-p3.heic
  ```

  `sips` keeps the camera name and stores the turn as the HEIC's own
  rotation.
