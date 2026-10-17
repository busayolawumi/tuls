# Tuls

Everyday file tools that run in your browser. Your files never leave your device.

Work in progress.

## Tools

- **Video to GIF**: trim, crop and turn a video into a GIF. It started as [Gify](https://github.com/busayolawumi/gify).
- **Merge PDFs**: combine several PDFs into one, in the order you choose.
- **Organise PDF**: reorder, rotate and delete the pages of a PDF.
- **Split PDF**: split a PDF into several smaller ones, at the pages you choose.
- **Images to PDF**: turn photos, scans and screenshots into one PDF, without their location and camera details.
- **PDF to images**: turn the pages of a PDF into JPG or PNG images.
- **Word to PDF**: turn Word documents (DOCX, DOC, ODT, RTF) into PDFs with LibreOffice, compiled to WebAssembly and running in the browser. The PDFs show the document as final: tracked changes accepted, no comments, and no author or title. Tuls adds two things LibreOffice lacks, so the layout matches Word's more closely: a Symbol font for Word's bullets, and Word's underlined trailing spaces.
- **Excel to PDF**: turn spreadsheets (XLSX, XLSM, XLS, ODS) into PDFs, laid out as they'd print: each sheet's own page setup, print areas and scaling, without hidden sheets or comments. Sheets that don't say what paper they use, and "short date" cells, follow the visitor's region, as Excel does.
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
