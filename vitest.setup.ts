import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setUnicodeFont } from './src/engines/pdf/forms.ts'
import { setQpdfWasm } from './src/engines/qpdf/qpdf.ts'

// In the browser, the PDF worker tells qpdf where its engine is (a URL).
// In the unit tests it's read from node_modules.
setQpdfWasm(
  fileURLToPath(import.meta.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm')),
)

setUnicodeFont(async () => {
  const bytes = await readFile(
    fileURLToPath(
      import.meta
        .resolve('@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf'),
    ),
  )
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
})
