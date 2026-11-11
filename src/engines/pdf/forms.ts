import {
  PDFBool,
  PDFButton,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFTextField,
  type PDFDocument,
  type PDFField,
  type PDFFont,
} from '@cantoo/pdf-lib'

// Annotation flags (PDF 1.7, table 165): hidden, and not shown on screen.
const HIDDEN = 1 << 1
const NO_VIEW = 1 << 5

let loadUnicodeFont: (() => Promise<ArrayBuffer>) | undefined

/**
 * How to get Noto Sans, for answers with letters Helvetica lacks: fetched
 * from the site in the browser (the PDF worker sets it), read from
 * node_modules in the unit tests.
 */
export function setUnicodeFont(load: () => Promise<ArrayBuffer>) {
  loadUnicodeFont = load
}

/**
 * Draws a PDF's form fields into its pages, as they look now, so filled-in
 * answers survive the pages being copied into a new PDF. Copying pages
 * leaves the form itself behind, so without this the fields stop working
 * and some answers disappear. The fields can't be edited afterwards.
 */
export async function flattenForm(doc: PDFDocument) {
  try {
    const form = doc.getForm()
    for (const field of form.getFields()) {
      // Fields on no page can't be seen, and pdf-lib can't flatten them: it
      // logs an error for each. Apple's apps leave such copies behind when
      // they save a form. They're taken out of the form's list directly,
      // since removeField looks for their page too.
      if (!onAPage(doc, field)) {
        form.acroForm.removeField(field.acroField)
        continue
      }
      // Buttons (Print, Clear form) hold no answers and won't work in the new
      // PDF, and hidden fields would show once drawn, so both go.
      if (field instanceof PDFButton || isHidden(field)) form.removeField(field)
    }

    // NeedAppearances means the saved looks may be out of date, and viewers
    // should redraw every field from its answer. Do the same.
    const redrawAll =
      form.acroForm.dict.lookup(PDFName.of('NeedAppearances')) === PDFBool.True
    // Some apps save answers without drawing them at all. Draw those, and any
    // out-of-date ones, in Helvetica, or in Noto Sans when an answer has
    // letters Helvetica lacks (Ọ, Ł, Greek, Cyrillic…). One field at a time,
    // so an odd field can't stop the rest being drawn.
    let helvetica: PDFFont | undefined
    let unicode: Promise<PDFFont | undefined> | undefined
    for (const field of form.getFields()) {
      try {
        if (redrawAll) form.markFieldAsDirty(field.ref)
        if (!field.needsAppearancesUpdate()) continue
        helvetica ??= form.getDefaultFont()
        let font = helvetica
        if (!fits(answerOf(field), helvetica)) {
          unicode ??= embedUnicodeFont(doc)
          const noto = await unicode
          if (noto) {
            font = noto
            if (field instanceof PDFTextField) prepareForNoto(field, noto)
          }
        }
        field.defaultUpdateAppearances(font)
      } catch (e) {
        console.warn(`Couldn’t draw the form field “${field.getName()}”:`, e)
      }
    }

    form.flatten({ updateFieldAppearances: false })
  } catch (e) {
    // An unusual form shouldn't stop the job: the pages still copy.
    console.warn('Couldn’t flatten the form:', e)
  }
}

/** The text a field shows, for choosing its font. */
function answerOf(field: PDFField) {
  if (field instanceof PDFTextField) return field.getText() ?? ''
  if (field instanceof PDFDropdown) return field.getSelected().join('')
  if (field instanceof PDFOptionList) return field.getOptions().join('')
  return ''
}

/** Whether a font has every letter of `text` (line breaks aside). */
function fits(text: string, font: PDFFont) {
  const letters = new Set(font.getCharacterSet())
  for (const letter of text) {
    const code = letter.codePointAt(0)!
    if (code >= 0x20 && !letters.has(code)) return false
  }
  return true
}

// "/Helv 12 Tf": a font and its size, in a field's default appearance.
const FONT_SIZE = /(\/\S+\s+)(\d*\.?\d+)(\s+Tf)/

/**
 * Noto Sans is taller than Helvetica, for accents and dots below, so a size
 * saved for Helvetica can push its letters out of a one-line box. Such sizes
 * are cut down to fit. Letters it lacks (Chinese, Arabic…) become "?", as
 * they do in Helvetica, rather than empty boxes.
 */
function prepareForNoto(field: PDFTextField, noto: PDFFont) {
  const text = field.getText() ?? ''
  const known = new Set(noto.getCharacterSet())
  const shown = Array.from(text, (letter) =>
    letter.codePointAt(0)! < 0x20 || known.has(letter.codePointAt(0)!)
      ? letter
      : '?',
  ).join('')
  if (shown !== text) field.setText(shown)
  if (field.isMultiline()) return

  const widgets = field.acroField.getWidgets()
  const inner = Math.min(
    ...widgets.map((widget) => {
      const border = widget.getBorderStyle()?.getWidth() ?? 0
      return widget.getRectangle().height - 2 * (border + 1)
    }),
  )
  if (!(inner > 0)) return
  // The whole height of Noto Sans, centred as pdf-lib centres it, fits
  // in 60% of the box.
  const most = Math.max(4, Math.floor(inner * 0.6))
  const shrink = (appearance: string | undefined) => {
    const size = Number(appearance?.match(FONT_SIZE)?.[2])
    return appearance && size > most
      ? appearance.replace(FONT_SIZE, `$1${most}$3`)
      : undefined
  }
  const own = shrink(field.acroField.getDefaultAppearance())
  if (own) field.acroField.setDefaultAppearance(own)
  for (const widget of widgets) {
    const smaller = shrink(widget.getDefaultAppearance())
    if (smaller) widget.setDefaultAppearance(smaller)
  }
}

/** Noto Sans, embedded with only the letters used. */
async function embedUnicodeFont(doc: PDFDocument) {
  if (!loadUnicodeFont) return undefined
  try {
    const [{ default: fontkit }, bytes] = await Promise.all([
      import('@cantoo/fontkit'),
      loadUnicodeFont(),
    ])
    doc.registerFontkit(fontkit)
    return await doc.embedFont(bytes, {
      subset: true,
      features: { ccmp: false },
    })
  } catch (e) {
    console.warn('Couldn’t load Noto Sans for the form:', e)
    return undefined
  }
}

function isHidden(field: PDFField) {
  const widgets = field.acroField.getWidgets()
  return (
    widgets.length > 0 &&
    widgets.every((widget) => widget.hasFlag(HIDDEN) || widget.hasFlag(NO_VIEW))
  )
}

/** Whether any of a field's widgets is on one of the PDF's pages. */
function onAPage(doc: PDFDocument, field: PDFField) {
  const pages = new Set(doc.getPages().map((page) => page.ref))
  return field.acroField.getWidgets().some((widget) => {
    const page = widget.P()
    if (page && pages.has(page)) return true
    const ref = doc.context.getObjectRef(widget.dict)
    return ref !== undefined && doc.findPageForAnnotationRef(ref) !== undefined
  })
}
