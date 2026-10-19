# Test files

Every file here is generated. None of them are personal files.

- `change-locked-by-apple.pdf`: a one-page PDF made by pdf-lib, then locked
  against changes by Apple's PDFKit on macOS (no password to open it, owner
  password "bank"), as some bank statements are. Apple writes encrypted
  strings in brackets, which is where pdf-lib's own decryption goes wrong.
  It has three strings that catch that out:

  - a link to `https://example.com/a)b`
  - a bookmark, "Step 1) Start"
  - a text field, `path`, filled in with `C:\Users\Ada (home`

  The PDF before locking, made with `@cantoo/pdf-lib`:

  ```js
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])
  page.drawText('Statement', { x: 20, y: 350 })
  const { context } = doc
  const link = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [20, 300, 200, 320],
      Border: [0, 0, 0],
      A: { S: 'URI', URI: PDFString.of('https://example.com/a\\)b') },
    }),
  )
  page.node.set(PDFName.of('Annots'), context.obj([link]))
  const outlines = context.nextRef()
  const item = context.nextRef()
  context.assign(
    item,
    context.obj({
      Title: PDFString.of('Step 1\\) Start'),
      Parent: outlines,
      Dest: [page.ref, 'Fit'],
    }),
  )
  context.assign(
    outlines,
    context.obj({ Type: 'Outlines', First: item, Last: item, Count: 1 }),
  )
  doc.catalog.set(PDFName.of('Outlines'), outlines)
  const field = doc.getForm().createTextField('path')
  field.setText('C:\\Users\\Ada (home')
  field.addToPage(page, { x: 20, y: 200, width: 300, height: 30 })
  writeFileSync('plain.pdf', await doc.save())
  ```

  Then locked with PDFKit (Swift, macOS 26):

  ```swift
  let doc = PDFDocument(url: URL(fileURLWithPath: "plain.pdf"))!
  doc.write(
    to: URL(fileURLWithPath: "change-locked-by-apple.pdf"),
    withOptions: [.userPasswordOption: "", .ownerPasswordOption: "bank"])
  ```
