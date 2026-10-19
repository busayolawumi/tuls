import {
  PDFBool,
  PDFButton,
  PDFName,
  type PDFDocument,
  type PDFField,
  type PDFFont,
} from '@cantoo/pdf-lib'

// Annotation flags (PDF 1.7, table 165): hidden, and not shown on screen.
const HIDDEN = 1 << 1
const NO_VIEW = 1 << 5

/**
 * Draws a PDF's form fields into its pages, as they look now, so filled-in
 * answers survive the pages being copied into a new PDF. Copying pages
 * leaves the form itself behind, so without this the fields stop working
 * and some answers disappear. The fields can't be edited afterwards.
 */
export function flattenForm(doc: PDFDocument) {
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
    // out-of-date ones, in Helvetica. It only has Western European letters,
    // so others come out as "?" (still better than a missing answer). One
    // field at a time, so an odd field can't stop the rest being drawn.
    let font: PDFFont | undefined
    for (const field of form.getFields()) {
      try {
        if (redrawAll) form.markFieldAsDirty(field.ref)
        if (field.needsAppearancesUpdate()) {
          font ??= form.getDefaultFont()
          field.defaultUpdateAppearances(font)
        }
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
