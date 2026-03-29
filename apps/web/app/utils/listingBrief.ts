export type BriefBlock =
  | { kind: 'prose'; text: string }
  | { kind: 'specs'; items: { label: string; value: string }[] }

/**
 * Inserts newlines before mashed labels like "...Ice BlueTransducer: ...".
 */
export function normalizeListingDescriptionText(text: string): string {
  let t = text.replaceAll('\r\n', '\n').trim()
  t = t.replaceAll(/([a-z0-9%)])([A-Z][a-zA-Z]*(?:\s+[a-z][a-zA-Z]*)*:)/g, '$1\n$2')
  return t
}

/** Semicolons often separate broker spec clauses. */
function widenWithSemicolons(text: string): string {
  return text.replaceAll(/;\s+/g, ';\n')
}

function parseSpecLine(line: string): { label: string; value: string } | null {
  const idx = line.indexOf(':')
  if (idx < 2 || idx > 52) return null
  const label = line.slice(0, idx).trim()
  const value = line.slice(idx + 1).trim()
  if (!value || !looksLikeSpecLabel(label)) return null
  return { label, value }
}

function looksLikeSpecLabel(label: string): boolean {
  const t = label.trim()
  if (t.length < 2 || t.length > 52) return false
  if (t.includes('. ')) return false
  if (!/^[A-Z0-9]/.test(t)) return false
  if (!/[a-z]/i.test(t)) return false
  return true
}

function linesFromText(text: string): string[] {
  const t = widenWithSemicolons(normalizeListingDescriptionText(text))
  return t
    .split(/\n/)
    .map((line) => line.trim().replace(/;\s*$/, '').trim())
    .map((line) => line.replace(/^;\s*/, '').trim())
    .filter(Boolean)
}

function linesToBlocks(lines: string[]): BriefBlock[] {
  const blocks: BriefBlock[] = []
  let specs: { label: string; value: string }[] = []
  let proseBuf: string[] = []

  const flushSpecs = () => {
    if (!specs.length) return
    blocks.push({ kind: 'specs', items: [...specs] })
    specs = []
  }

  const flushProse = () => {
    if (!proseBuf.length) return
    const text = proseBuf.join('\n\n').replaceAll(/\n{3,}/g, '\n\n').trim()
    if (text) blocks.push({ kind: 'prose', text })
    proseBuf = []
  }

  for (const line of lines) {
    const spec = parseSpecLine(line)
    if (spec) {
      flushProse()
      specs.push(spec)
    } else {
      flushSpecs()
      proseBuf.push(line)
    }
  }
  flushSpecs()
  flushProse()

  return blocks
}

/** Split long prose-only blobs into readable paragraphs on sentence boundaries. */
export function splitProseIntoParagraphs(text: string): string[] {
  const t = text.replaceAll(/\s+/g, ' ').trim()
  if (!t) return []
  const parts = t.split(/(?<=[.!?])\s+(?=[A-Z\d"'])/).map((p) => p.trim()).filter(Boolean)
  return parts.length ? parts : [t]
}

/**
 * Turns listing description into prose blocks and label/value grids (works best when the source
 * uses newlines or semicolons; mashed one-line blobs still get mash-fixes only).
 */
export function parseListingBrief(raw: string): BriefBlock[] {
  if (!raw.trim()) return []

  const lines = linesFromText(raw)
  if (!lines.length) return []

  const blocks = linesToBlocks(lines)

  // If everything collapsed to one prose block, break sentences for readability.
  const only = blocks[0]
  if (blocks.length === 1 && only?.kind === 'prose') {
    const paras = splitProseIntoParagraphs(only.text)
    if (paras.length > 1) return paras.map((text) => ({ kind: 'prose' as const, text }))
  }

  return blocks
}
