# Tuls

PDF, document, image and video tools that run in your browser. Your files never leave your device.

Work in progress.

## Tools

- **Video to GIF**: trim, crop and turn a video into a GIF. It started as [Gify](https://github.com/busayolawumi/gify).
- **Convert images**: turn iPhone photos (HEIC) into JPG, or convert between JPG, PNG and WebP (AVIF, GIF and BMP go in too). Photos come out upright, without location, camera or other details, and keep their colours: iPhones' wider Display P3 colours stay, with their profile, where the browser can save them. Safari opens HEIC itself; other browsers use [libheif](https://github.com/strukturag/libheif) compiled to WebAssembly (about 490 KB, fetched only when needed), which Images to PDF uses too. Safari can't save WebP, so a small WebP encoder from jSquash does it there.
- **Resize images**: make images smaller in width and height, by a percentage or to a size you choose, without ever enlarging them. The format stays the same (HEIC becomes JPG), and photos come out upright, without their details. It shrinks them with Lanczos from jSquash (about 17 KB), so they look the same in every browser.
- **Compress images**: make images smaller in file size at Recommended (looks the same, at full size), Smallest (very big photos become 2560 pixels across), or under a size you choose, where the quality comes down first and the picture is made smaller only if it has to be. JPGs go through MozJPEG, WebPs through libwebp, and PNGs are reduced to 256 colours with libimagequant where that doesn't show, then optimised with oxipng, all compiled to WebAssembly and fetched only when needed. A before/after slider shows the difference. Images that can't get at least 5% smaller are left as they are.
- **Image to text**: copy the text out of photos and screenshots, in the same eight languages as OCR PDF and with the same text reader. Each image's text shows with a Copy button, and everything can be saved as one .txt file. Sideways photos are read the right way up.
- **Merge PDFs**: combine several PDFs into one, in the order you choose. Bookmarks come along, and filled-in form answers are drawn into the pages, in Noto Sans when they have letters Helvetica lacks.
- **Organise PDF**: reorder, rotate and delete the pages of a PDF. Bookmarks follow their pages.
- **Split PDF**: split a PDF into several smaller ones, at the pages you choose. Each part keeps the bookmarks for its own pages.
- **Images to PDF**: turn photos, scans and screenshots into one PDF, without their location and camera details.
- **PDF to images**: turn the pages of a PDF into JPG or PNG images.
- **Protect PDF**: add a password to PDFs, with AES-256, using [qpdf](https://qpdf.sourceforge.io) compiled to WebAssembly. Whoever has the password can open, print and copy the PDF. Accented letters work on every device, and the page warns about characters iPhones and Macs can't take.
- **Unlock PDF**: take the password off PDFs you can open, with qpdf.
- **Compress PDF**: make PDFs smaller for email and uploads, at Recommended (pictures at 150 dpi; looks the same and prints well) or Smallest (96 dpi). Photos and scans shrink the most; text, links, bookmarks and form fields are kept. It uses PyMuPDF with only what compressing needs (about 23 MB, shared with PDF to Word), and re-encodes JPEGs itself, because MuPDF 1.26.3's own rewriter garbles grey and CMYK ones.
- **OCR PDF**: make scanned PDFs searchable. Pages without text are drawn at 300 dpi and read with [Tesseract](https://github.com/tesseract-ocr/tesseract) (through tesseract.js, compiled to WebAssembly; about 4.5 MB the first time with English), in English, French, German, Italian, Dutch, Portuguese, Spanish or Yoruba. The text is laid invisibly over each page with qpdf, so the pages look exactly as before. Up to four pages are read side by side on a computer, with a time estimate; sideways or upside-down pages are turned the right way up; pages that already have text are left alone.
- **Word to PDF**: turn Word documents (DOCX, DOC, ODT, RTF) into PDFs with LibreOffice, compiled to WebAssembly and running in the browser. The PDFs show the document as final: tracked changes accepted, no comments, and no author or title. Tuls adds two things LibreOffice lacks, so the layout matches Word's more closely: a Symbol font for Word's bullets, and Word's underlined trailing spaces.
- **PDF to Word**: turn PDFs into Word documents you can edit, with PyMuPDF and pdf2docx (Python, running in the browser through Pyodide). It works best with PDFs made from documents. Scanned pages are pointed out before converting, since they stay pictures, and the Word files carry none of the PDF's details.
- **PDF to Excel**: turn the tables in PDFs, such as bank statements and invoices, into spreadsheets, one sheet per table. Tables with or without lines are found, a table running over several pages becomes one sheet, and amounts, negatives, percentages and dates become real numbers and dates, with the decimal mark and date order read from the table itself. You choose which tables to keep before the file is made. It uses the same light PyMuPDF engine as Compress PDF, and writes the .xlsx itself.
- **Excel to PDF**: turn spreadsheets (XLSX, XLSM, XLS, ODS, CSV) into PDFs, laid out as they'd print: each sheet's own page setup, print areas and scaling, without hidden sheets or comments. Sheets that don't say what paper they use, and "short date" cells, follow the visitor's region, as Excel does. CSV and TSV files work too: their separator, text encoding and number style are worked out from the file, and they're laid out to print readably, with the heading on every page, the columns kept together, landscape when needed, and gridlines.
- **PowerPoint to PDF**: turn presentations (PPTX, PPSX, PPT, ODP) into PDFs, one slide to a page, without hidden slides, speaker notes or comments. In all three Office tools, twelve popular free fonts (Roboto, Open Sans, Montserrat, Lato, Poppins, Inter and others) come with the converter, so documents using them come out in the very same font. For 30 fonts that can't be included, such as Office's Aptos, the free font closest in width stands in, so lines break about where they do in Office. Charts also get two things LibreOffice lacks: labels in capitals, and gridlines drawn with a gradient.

## Development

- `npm run dev` starts the dev server
- `npm run build` type-checks and builds
- `npm run lint` runs Oxlint
- `npm run format` runs Prettier, which also sorts Tailwind classes
- `npm test` runs the unit tests (Vitest)
- `npm run test:e2e` builds, then runs the browser tests (Playwright)

## Licence

Tuls is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). You can use, change and share it, but if you run a changed version as a website, you must publish your source code too.
