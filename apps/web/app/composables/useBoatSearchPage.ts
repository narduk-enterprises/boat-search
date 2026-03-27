interface BoatRow {
  id: number
  year: number | null
  make: string | null
  model: string | null
  length: string | null
  city: string | null
  state: string | null
  location: string | null
  price: number | null
  description: string | null
  sellerType: string | null
  source: string
  images: string[]
}

function parseNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

/**
 * Search results backed by /api/boats with reactive URL query (for /search page).
 */
export function useBoatSearchPage() {
  const route = useRoute()
  const router = useRouter()

  const makeFilter = ref('')
  const minPrice = ref<number | undefined>(undefined)
  const maxPrice = ref<number | undefined>(undefined)
  const minLength = ref<number | undefined>(undefined)
  const maxLength = ref<number | undefined>(undefined)

  function readQueryIntoRefs() {
    const q = route.query
    makeFilter.value = String(q.make || '')
    minPrice.value = parseNum(q.minPrice)
    maxPrice.value = parseNum(q.maxPrice)
    minLength.value = parseNum(q.minLength)
    maxLength.value = parseNum(q.maxLength)
  }

  readQueryIntoRefs()

  watch(
    () => route.query,
    () => {
      readQueryIntoRefs()
    },
  )

  const apiQuery = computed(() => {
    const q: Record<string, string> = {}
    if (makeFilter.value) q.make = makeFilter.value
    if (minPrice.value != null && !Number.isNaN(minPrice.value)) q.minPrice = String(minPrice.value)
    if (maxPrice.value != null && !Number.isNaN(maxPrice.value)) q.maxPrice = String(maxPrice.value)
    if (minLength.value != null && !Number.isNaN(minLength.value))
      q.minLength = String(minLength.value)
    if (maxLength.value != null && !Number.isNaN(maxLength.value))
      q.maxLength = String(maxLength.value)
    return q
  })

  const filterPayload = computed(() => {
    const f: {
      make?: string
      minLength?: number
      maxLength?: number
      minPrice?: number
      maxPrice?: number
    } = {}
    if (makeFilter.value) f.make = makeFilter.value
    if (minPrice.value != null && !Number.isNaN(minPrice.value)) f.minPrice = minPrice.value
    if (maxPrice.value != null && !Number.isNaN(maxPrice.value)) f.maxPrice = maxPrice.value
    if (minLength.value != null && !Number.isNaN(minLength.value)) f.minLength = minLength.value
    if (maxLength.value != null && !Number.isNaN(maxLength.value)) f.maxLength = maxLength.value
    return f
  })

  const { data: boats, status } = useFetch<BoatRow[]>('/api/boats', { query: apiQuery })

  function applyFilters() {
    if (import.meta.client) {
      const { capture } = usePosthog()
      capture('search_apply_filters', { ...filterPayload.value })
    }
    router.push({ path: '/search', query: apiQuery.value })
  }

  function clearFilters() {
    makeFilter.value = ''
    minPrice.value = undefined
    maxPrice.value = undefined
    minLength.value = undefined
    maxLength.value = undefined
    router.push({ path: '/search' })
  }

  const hasActiveFilters = computed(
    () =>
      !!(
        makeFilter.value ||
        minPrice.value != null ||
        maxPrice.value != null ||
        minLength.value != null ||
        maxLength.value != null
      ),
  )

  return {
    boats,
    status,
    makeFilter,
    minPrice,
    maxPrice,
    minLength,
    maxLength,
    applyFilters,
    clearFilters,
    hasActiveFilters,
    filterPayload,
  }
}
