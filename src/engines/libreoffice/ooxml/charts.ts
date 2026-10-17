import {
  averageColour,
  srgbColour,
  USUAL_MAP,
  type ThemeColours,
} from './colours'
import { decodeText, encodeText } from './xml'

// Charts in Word, Excel and PowerPoint files can ask for their category
// labels in capitals (cap="all" on the category axis's text), and Office
// shows "FACEBOOK" for a label stored as "Facebook". LibreOffice ignores the
// setting, so Tuls capitalises the stored labels instead, which is what
// Office shows. Charts with more than one category axis are left alone,
// as which series uses which axis would need working out.

const CATEGORY_AXIS = /<c:(catAx|dateAx)>[\s\S]*?<\/c:\1>/g
const CATEGORIES = /<c:cat>[\s\S]*?<\/c:cat>/g
const VALUE = /<c:v>([^<]*)<\/c:v>/g

/** Whether an axis's text properties ask for all capitals. */
function capitalised(axis: string) {
  const text = /<c:txPr>[\s\S]*?<\/c:txPr>/.exec(axis)?.[0] ?? ''
  return /<a:defRPr\b[^>]*\bcap="all"/.test(text)
}

/** The chart with its category labels in capitals, if it asks for them. */
export function capitalizeCategories(chartXml: string) {
  const axes = chartXml.match(CATEGORY_AXIS) ?? []
  if (axes.length !== 1 || !capitalised(axes[0])) return chartXml
  return chartXml.replace(CATEGORIES, (categories) =>
    // Only text labels: numbers and dates (c:numCache) stay as they are.
    categories.includes('<c:numRef>') || categories.includes('<c:numLit>')
      ? categories
      : categories.replace(
          VALUE,
          (_, value: string) =>
            `<c:v>${encodeText(decodeText(value).toUpperCase())}</c:v>`,
        ),
  )
}

// Lines drawn with a gradient, such as the gridlines of some of Office's
// chart styles: LibreOffice can't draw a line with a gradient and uses one
// end's colour, often near-invisible. Tuls draws them in the gradient's
// average colour instead, worked out from the document's theme. A line whose
// colours Tuls can't work out is left alone.

// An a:ln with content (not self-closing), and a gradient inside it.
const LINE = /<a:ln\b(?:[^>"']|"[^"]*"|'[^']*')*?(?<!\/)>[\s\S]*?<\/a:ln>/g
const GRADIENT = /<a:gradFill\b[^>]*>([\s\S]*?)<\/a:gradFill>/

/** Whether the chart has any lines drawn with a gradient. */
export function hasGradientLines(chartXml: string) {
  return (chartXml.match(LINE) ?? []).some((line) => GRADIENT.test(line))
}

/** The chart with each gradient line drawn in one colour. */
export function solidLines(
  chartXml: string,
  theme: ThemeColours,
  map = USUAL_MAP,
) {
  return chartXml.replace(LINE, (line) => {
    const gradient = GRADIENT.exec(line)
    if (!gradient) return line
    const colour = averageColour(gradient[1], theme, map)
    if (!colour) return line
    return line.replace(
      gradient[0],
      `<a:solidFill>${srgbColour(colour)}</a:solidFill>`,
    )
  })
}
