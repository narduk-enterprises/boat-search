import { toRaw } from 'vue'

function toPlainValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return undefined
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  const rawValue = toRaw(value)

  if (Array.isArray(rawValue)) {
    if (seen.has(rawValue)) {
      return seen.get(rawValue)
    }

    const nextArray: unknown[] = []
    seen.set(rawValue, nextArray)
    for (const entry of rawValue) {
      nextArray.push(toPlainValue(entry, seen))
    }
    return nextArray
  }

  if (rawValue instanceof Map) {
    if (seen.has(rawValue)) {
      return seen.get(rawValue)
    }

    const nextEntries: Array<[unknown, unknown]> = []
    seen.set(rawValue, nextEntries)
    for (const [key, entry] of rawValue.entries()) {
      nextEntries.push([toPlainValue(key, seen), toPlainValue(entry, seen)])
    }
    return nextEntries
  }

  if (rawValue instanceof Set) {
    if (seen.has(rawValue)) {
      return seen.get(rawValue)
    }

    const nextValues: unknown[] = []
    seen.set(rawValue, nextValues)
    for (const entry of rawValue.values()) {
      nextValues.push(toPlainValue(entry, seen))
    }
    return nextValues
  }

  if (typeof rawValue === 'object' && rawValue !== null) {
    if (seen.has(rawValue)) {
      return seen.get(rawValue)
    }

    const nextObject: Record<string, unknown> = {}
    seen.set(rawValue, nextObject)
    for (const [key, entry] of Object.entries(rawValue)) {
      const nextEntry = toPlainValue(entry, seen)
      if (typeof nextEntry !== 'undefined') {
        nextObject[key] = nextEntry
      }
    }
    return nextObject
  }

  return rawValue
}

export function cloneSerializableValue<T>(value: T): T {
  return toPlainValue(value, new WeakMap()) as T
}
