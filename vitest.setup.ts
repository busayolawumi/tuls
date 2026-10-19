import { fileURLToPath } from 'node:url'
import { setQpdfWasm } from './src/engines/qpdf/qpdf.ts'

// In the browser, the PDF worker tells qpdf where its engine is (a URL).
// In the unit tests it's read from node_modules.
setQpdfWasm(
  fileURLToPath(import.meta.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm')),
)
