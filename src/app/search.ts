import type { ToolManifest } from '../tools/types.ts'

// Words that say nothing about which tool is meant.
const IGNORED = new Set([
  'a',
  'an',
  'and',
  'the',
  'to',
  'into',
  'in',
  'of',
  'or',
  'for',
  'from',
  'with',
  'my',
  'your',
  'you',
  'it',
  'right',
  'browser',
  'file',
  'files',
  'device',
  'never',
  'leave',
  'one',
  'online',
  'free',
])

/** Lowercase words without accents: "Organise PDF" → ["organise", "pdf"]. */
export function words(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

// "pdfs" finds "pdf" too, and "image" finds "images" by its start.
function forms(word: string) {
  return word.length > 3 && word.endsWith('s')
    ? [word, word.slice(0, -1)]
    : [word]
}

const matches = (haystack: string[], word: string) =>
  forms(word).some((form) => haystack.some((other) => other.startsWith(form)))

type Field = { words: string[]; weight: number }

function fieldsOf(tool: ToolManifest): Field[] {
  return [
    { words: words(tool.name), weight: 4 },
    { words: tool.keywords.flatMap(words), weight: 3 },
    { words: tool.accepts, weight: 3 },
    { words: words(tool.category), weight: 2 },
    { words: words(tool.description), weight: 1 },
  ]
}

/**
 * The tools a search finds, best first: every word typed must be somewhere in
 * a tool's name, keywords, file types, group or description. For a few words
 * ("pdf to w"), a tool whose name starts with them comes first, then one with
 * them among its keywords. Then it's by where the words were found (the name
 * counts most), and then the home page's order.
 */
export function searchTools(tools: ToolManifest[], query: string) {
  const typed = words(query)
  const wanted = typed.filter((word) => !IGNORED.has(word))
  if (wanted.length === 0) return tools
  const phrase = typed.join(' ')
  const found: { tool: ToolManifest; score: number; index: number }[] = []
  tools.forEach((tool, index) => {
    const fields = fieldsOf(tool)
    let score = 0
    for (const word of wanted) {
      const best = Math.max(
        0,
        ...fields
          .filter((field) => matches(field.words, word))
          .map((field) => field.weight),
      )
      if (best === 0) return
      score += best
    }
    if (typed.length > 1) {
      if (words(tool.name).join(' ').startsWith(phrase)) score += 20
      else if (tool.keywords.some((k) => words(k).join(' ').includes(phrase)))
        score += 10
    }
    found.push({ tool, score, index })
  })
  return found
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ tool }) => tool)
}
