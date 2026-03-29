export interface BoatDedupeRecord {
  id: number
  source: string
  url: string
  listingId: string | null
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: string | null
  location: string | null
  city: string | null
  state: string | null
  country: string | null
  contactInfo?: string | null
  contactName?: string | null
  contactPhone?: string | null
  description?: string | null
  fullText?: string | null
  images?: string[]
  updatedAt: string
}

export interface BoatDedupeInput extends Omit<BoatDedupeRecord, 'id' | 'updatedAt' | 'source'> {
  source: string
}

export interface BoatDedupeCandidate {
  leftBoatId: number
  rightBoatId: number
  confidenceScore: number
  ruleHits: string[]
}

export interface BoatEntityDraft {
  memberBoatIds: number[]
  representativeBoatId: number
}

export interface BoatDedupeAssignment {
  boatId: number
  entityKey: number | null
  supersededByBoatId: number | null
  dedupeMethod: string | null
  dedupeConfidence: number | null
}

export interface BoatDedupeResult {
  assignments: BoatDedupeAssignment[]
  entities: BoatEntityDraft[]
  candidates: BoatDedupeCandidate[]
}

type StrongMatch = {
  leftBoatId: number
  rightBoatId: number
  confidence: number
}

function normalizeWhitespace(value: string) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

export function normalizeBoatToken(value: string | null | undefined) {
  if (!value) return ''
  return normalizeWhitespace(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeBoatUrl(value: string | null | undefined) {
  if (!value) return ''

  try {
    const url = new URL(value)
    url.hash = ''
    url.search = ''
    url.hostname = url.hostname.toLowerCase()
    const pathname = url.pathname.replace(/\/+$/, '')
    return `${url.protocol}//${url.hostname}${pathname || '/'}`
  } catch {
    return normalizeWhitespace(value)
  }
}

export function normalizeContactPhone(value: string | null | undefined) {
  if (!value) return ''

  const digits = value.replaceAll(/\D/g, '')
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

export function parseBoatLengthFeet(value: string | null | undefined) {
  if (!value) return null

  const match = value.match(/\d+(?:\.\d+)?/)
  if (!match) return null

  const parsed = Number.parseFloat(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

export function parseBoatPriceAmount(value: string | null | undefined) {
  if (!value) return null

  const digits = value.replaceAll(/\D/g, '')
  if (!digits) return null

  const parsed = Number.parseInt(digits, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeLocationKey(record: Pick<BoatDedupeRecord, 'city' | 'state' | 'location'>) {
  return [record.city, record.state, record.location].map(normalizeBoatToken).filter(Boolean)
}

function normalizedPhoneForRecord(record: Pick<BoatDedupeRecord, 'contactPhone' | 'contactInfo'>) {
  return normalizeContactPhone(record.contactPhone || record.contactInfo || '')
}

export function boatCompletenessScore(record: BoatDedupeRecord) {
  let score = 0

  if (record.price) score += 2
  if (record.make) score += 1
  if (record.model) score += 1
  if (record.year) score += 1
  if (record.length) score += 1
  if (record.location || record.city || record.state) score += 1
  if (record.contactPhone || record.contactInfo) score += 1
  if (record.description) score += Math.min(3, Math.floor(record.description.length / 120))
  if (record.fullText) score += Math.min(3, Math.floor(record.fullText.length / 250))
  if (record.images?.length) score += Math.min(4, record.images.length)

  return score
}

function compareBoatPriority(left: BoatDedupeRecord, right: BoatDedupeRecord) {
  const scoreDelta = boatCompletenessScore(right) - boatCompletenessScore(left)
  if (scoreDelta !== 0) return scoreDelta

  const updatedAtDelta = right.updatedAt.localeCompare(left.updatedAt)
  if (updatedAtDelta !== 0) return updatedAtDelta

  return right.id - left.id
}

function pickPreferredBoat(records: BoatDedupeRecord[]) {
  return [...records].sort(compareBoatPriority)[0]!
}

function sameYearMakeModel(left: BoatDedupeRecord, right: BoatDedupeRecord) {
  return (
    left.year != null &&
    left.year === right.year &&
    normalizeBoatToken(left.make) !== '' &&
    normalizeBoatToken(left.make) === normalizeBoatToken(right.make) &&
    normalizeBoatToken(left.model) !== '' &&
    normalizeBoatToken(left.model) === normalizeBoatToken(right.model)
  )
}

function similarLength(left: BoatDedupeRecord, right: BoatDedupeRecord, toleranceFeet = 1) {
  const leftLength = parseBoatLengthFeet(left.length)
  const rightLength = parseBoatLengthFeet(right.length)
  if (leftLength == null || rightLength == null) return false
  return Math.abs(leftLength - rightLength) <= toleranceFeet
}

function similarLocation(left: BoatDedupeRecord, right: BoatDedupeRecord) {
  const leftState = normalizeBoatToken(left.state)
  const rightState = normalizeBoatToken(right.state)
  if (!leftState || leftState !== rightState) return false

  const leftCity = normalizeBoatToken(left.city)
  const rightCity = normalizeBoatToken(right.city)
  if (leftCity && rightCity) {
    return leftCity === rightCity
  }

  const leftLocation = normalizeLocationKey(left).join(' ')
  const rightLocation = normalizeLocationKey(right).join(' ')
  return Boolean(leftLocation && rightLocation && leftLocation === rightLocation)
}

function narrowPriceBand(left: BoatDedupeRecord, right: BoatDedupeRecord, threshold = 0.1) {
  const leftPrice = parseBoatPriceAmount(left.price)
  const rightPrice = parseBoatPriceAmount(right.price)
  if (leftPrice == null || rightPrice == null) return false

  const baseline = Math.max(leftPrice, rightPrice)
  if (baseline === 0) return false
  return Math.abs(leftPrice - rightPrice) / baseline <= threshold
}

export function findMatchingSourceListing(
  existingRecords: BoatDedupeRecord[],
  candidate: BoatDedupeInput,
) {
  if (candidate.listingId) {
    const byListingId = existingRecords.find(
      (record) =>
        record.source === candidate.source &&
        record.listingId != null &&
        record.listingId === candidate.listingId,
    )
    if (byListingId) return byListingId
  }

  const normalizedUrl = normalizeBoatUrl(candidate.url)
  return existingRecords.find((record) => normalizeBoatUrl(record.url) === normalizedUrl) ?? null
}

export function chooseRepresentativeBoat(records: BoatDedupeRecord[]) {
  return pickPreferredBoat(records)
}

export function evaluateStrongAutoMatch(left: BoatDedupeRecord, right: BoatDedupeRecord) {
  if (left.source === right.source) return null
  if (!sameYearMakeModel(left, right)) return null
  if (!similarLength(left, right)) return null

  const leftPhone = normalizedPhoneForRecord(left)
  const rightPhone = normalizedPhoneForRecord(right)
  if (!leftPhone || leftPhone !== rightPhone) return null

  return {
    leftBoatId: left.id,
    rightBoatId: right.id,
    confidence: 100,
  } satisfies StrongMatch
}

export function evaluateUncertainCandidate(
  left: BoatDedupeRecord,
  right: BoatDedupeRecord,
): BoatDedupeCandidate | null {
  if (left.source === right.source) return null
  if (!sameYearMakeModel(left, right)) return null
  if (!similarLength(left, right)) return null
  if (!similarLocation(left, right)) return null
  if (!narrowPriceBand(left, right)) return null

  const ruleHits = [
    'same_year_make_model',
    'length_within_1ft',
    'location_similar',
    'price_within_10pct',
  ]
  const leftName = normalizeBoatToken(left.contactName || '')
  const rightName = normalizeBoatToken(right.contactName || '')
  let confidenceScore = 78
  if (leftName && rightName && leftName === rightName) {
    confidenceScore += 6
    ruleHits.push('contact_name_match')
  }

  const [leftBoatId, rightBoatId] = left.id < right.id ? [left.id, right.id] : [right.id, left.id]
  return {
    leftBoatId,
    rightBoatId,
    confidenceScore,
    ruleHits,
  }
}

class UnionFind {
  private readonly parent = new Map<number, number>()

  add(value: number) {
    if (!this.parent.has(value)) {
      this.parent.set(value, value)
    }
  }

  find(value: number): number {
    const parent = this.parent.get(value)
    if (parent == null) {
      this.parent.set(value, value)
      return value
    }

    if (parent === value) return value

    const root = this.find(parent)
    this.parent.set(value, root)
    return root
  }

  union(left: number, right: number) {
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)
    if (leftRoot === rightRoot) return
    this.parent.set(rightRoot, leftRoot)
  }
}

export function deriveBoatDedupeState(records: BoatDedupeRecord[]): BoatDedupeResult {
  const assignments = new Map<number, BoatDedupeAssignment>()

  for (const record of records) {
    assignments.set(record.id, {
      boatId: record.id,
      entityKey: null,
      supersededByBoatId: null,
      dedupeMethod: null,
      dedupeConfidence: null,
    })
  }

  const listingGroups = new Map<string, BoatDedupeRecord[]>()
  for (const record of records) {
    if (!record.listingId) continue
    const key = `${record.source}::${record.listingId}`
    const group = listingGroups.get(key) ?? []
    group.push(record)
    listingGroups.set(key, group)
  }

  for (const group of listingGroups.values()) {
    if (group.length < 2) continue
    const survivor = pickPreferredBoat(group)
    for (const record of group) {
      if (record.id === survivor.id) continue
      assignments.set(record.id, {
        boatId: record.id,
        entityKey: null,
        supersededByBoatId: survivor.id,
        dedupeMethod: 'exact-source-listing',
        dedupeConfidence: 100,
      })
    }
  }

  const activeAfterListingDedup = records.filter(
    (record) => assignments.get(record.id)?.supersededByBoatId == null,
  )
  const urlGroups = new Map<string, BoatDedupeRecord[]>()
  for (const record of activeAfterListingDedup) {
    const key = normalizeBoatUrl(record.url)
    const group = urlGroups.get(key) ?? []
    group.push(record)
    urlGroups.set(key, group)
  }

  for (const group of urlGroups.values()) {
    if (group.length < 2) continue
    const survivor = pickPreferredBoat(group)
    for (const record of group) {
      if (record.id === survivor.id) continue
      assignments.set(record.id, {
        boatId: record.id,
        entityKey: null,
        supersededByBoatId: survivor.id,
        dedupeMethod: 'exact-url',
        dedupeConfidence: 100,
      })
    }
  }

  const activeRecords = records.filter(
    (record) => assignments.get(record.id)?.supersededByBoatId == null,
  )
  const buckets = new Map<string, BoatDedupeRecord[]>()
  for (const record of activeRecords) {
    const make = normalizeBoatToken(record.make)
    const model = normalizeBoatToken(record.model)
    if (record.year == null || !make || !model) continue
    const key = `${record.year}::${make}::${model}`
    const bucket = buckets.get(key) ?? []
    bucket.push(record)
    buckets.set(key, bucket)
  }

  const unionFind = new UnionFind()
  for (const record of activeRecords) {
    unionFind.add(record.id)
  }

  const strongMatches: StrongMatch[] = []
  const uncertainCandidates = new Map<string, BoatDedupeCandidate>()
  for (const bucket of buckets.values()) {
    for (let index = 0; index < bucket.length; index += 1) {
      for (let inner = index + 1; inner < bucket.length; inner += 1) {
        const left = bucket[index]!
        const right = bucket[inner]!
        const strongMatch = evaluateStrongAutoMatch(left, right)
        if (strongMatch) {
          strongMatches.push(strongMatch)
          unionFind.union(left.id, right.id)
          continue
        }

        const candidate = evaluateUncertainCandidate(left, right)
        if (candidate) {
          uncertainCandidates.set(`${candidate.leftBoatId}:${candidate.rightBoatId}`, candidate)
        }
      }
    }
  }

  const componentGroups = new Map<number, BoatDedupeRecord[]>()
  for (const record of activeRecords) {
    const root = unionFind.find(record.id)
    const group = componentGroups.get(root) ?? []
    group.push(record)
    componentGroups.set(root, group)
  }

  const entities: BoatEntityDraft[] = []
  const strongestConfidenceByBoatId = new Map<number, number>()
  for (const match of strongMatches) {
    strongestConfidenceByBoatId.set(
      match.leftBoatId,
      Math.max(match.confidence, strongestConfidenceByBoatId.get(match.leftBoatId) ?? 0),
    )
    strongestConfidenceByBoatId.set(
      match.rightBoatId,
      Math.max(match.confidence, strongestConfidenceByBoatId.get(match.rightBoatId) ?? 0),
    )
  }

  for (const group of componentGroups.values()) {
    const representative = chooseRepresentativeBoat(group)
    entities.push({
      memberBoatIds: group.map((record) => record.id).sort((left, right) => left - right),
      representativeBoatId: representative.id,
    })

    for (const record of group) {
      assignments.set(record.id, {
        boatId: record.id,
        entityKey: representative.id,
        supersededByBoatId: null,
        dedupeMethod: group.length > 1 ? 'cross-source-contact' : null,
        dedupeConfidence:
          group.length > 1 ? (strongestConfidenceByBoatId.get(record.id) ?? 100) : null,
      })
    }
  }

  const candidates = [...uncertainCandidates.values()].filter((candidate) => {
    const leftAssignment = assignments.get(candidate.leftBoatId)
    const rightAssignment = assignments.get(candidate.rightBoatId)
    return (
      leftAssignment?.supersededByBoatId == null &&
      rightAssignment?.supersededByBoatId == null &&
      leftAssignment?.entityKey !== rightAssignment?.entityKey
    )
  })

  return {
    assignments: [...assignments.values()].sort((left, right) => left.boatId - right.boatId),
    entities: entities.sort(
      (left, right) => left.representativeBoatId - right.representativeBoatId,
    ),
    candidates: candidates.sort((left, right) =>
      left.leftBoatId === right.leftBoatId
        ? left.rightBoatId - right.rightBoatId
        : left.leftBoatId - right.leftBoatId,
    ),
  }
}
