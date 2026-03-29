import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { cloneSerializableValue } from '@/sidepanel/utils/cloneSerializableValue'

describe('cloneSerializableValue', () => {
  it('unwraps Vue reactive state into plain cloneable data', () => {
    const source = reactive({
      name: 'YachtWorld draft',
      config: {
        startUrls: ['https://www.yachtworld.com/boats-for-sale/'],
        fields: [
          {
            key: 'images',
            scope: 'detail',
            selector: '.gallery img',
          },
        ],
      },
      event: {
        detail: {
          message: 'Auto-filled the next-page selector.',
        },
      },
    })

    const clone = cloneSerializableValue(source)

    expect(clone).toEqual({
      name: 'YachtWorld draft',
      config: {
        startUrls: ['https://www.yachtworld.com/boats-for-sale/'],
        fields: [
          {
            key: 'images',
            scope: 'detail',
            selector: '.gallery img',
          },
        ],
      },
      event: {
        detail: {
          message: 'Auto-filled the next-page selector.',
        },
      },
    })
    expect(structuredClone(clone)).toEqual(clone)
    expect(clone).not.toBe(source)
    expect(clone.config).not.toBe(source.config)
    expect(clone.event.detail).not.toBe(source.event.detail)
  })

  it('serializes error and bigint values without throwing', () => {
    const clone = cloneSerializableValue({
      error: new Error('Server Error'),
      attempt: 2n,
    })

    expect(clone).toEqual({
      error: {
        name: 'Error',
        message: 'Server Error',
        stack: expect.any(String),
      },
      attempt: '2',
    })
    expect(structuredClone(clone)).toEqual(clone)
  })
})
