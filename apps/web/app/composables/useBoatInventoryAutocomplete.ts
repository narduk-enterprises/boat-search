import type { MaybeRefOrGetter } from 'vue'
import type { BoatInventoryAutocompleteFieldState } from '~~/app/types/boat-inventory'

interface BoatInventoryAutocompleteOptions {
  makeQuery: MaybeRefOrGetter<string>
  locationQuery: MaybeRefOrGetter<string>
}

function createAutocompleteFieldState(helperText: string): BoatInventoryAutocompleteFieldState {
  return {
    enabled: false,
    loading: false,
    items: [],
    helperText,
  }
}

export function useBoatInventoryAutocomplete(_options: BoatInventoryAutocompleteOptions) {
  const makeField = computed<BoatInventoryAutocompleteFieldState>(() =>
    createAutocompleteFieldState('Make autocomplete is scaffolded here but not wired yet.'),
  )
  const locationField = computed<BoatInventoryAutocompleteFieldState>(() =>
    createAutocompleteFieldState('Location autocomplete is scaffolded here but not wired yet.'),
  )

  return {
    makeField,
    locationField,
  }
}
