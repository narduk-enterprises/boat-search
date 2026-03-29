import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSessionUser, requireAuth, requireAdmin } from '../../server/utils/auth'

// Mock Nitro auto-imports
vi.stubGlobal('createError', (opts: { statusCode: number; message: string }) => {
  const err = new Error(opts.message) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})

vi.stubGlobal('useRuntimeConfig', () => ({
  sessionCookieName: 'test_session',
}))

// requireAuth checks nuxt-auth-utils session first; stub to return no session
const mockedGetUserSession = vi.fn().mockResolvedValue(null)
vi.stubGlobal('getUserSession', mockedGetUserSession)

// Mock useDatabase
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
}

vi.stubGlobal('useDatabase', () => mockDb)

// Mock h3 functions
vi.mock('h3', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getRequestHeader: vi.fn((event: { node?: { req?: { headers?: Record<string, string> } } }, name: string) => {
    const headerValue = event?.node?.req?.headers?.[name]
    if (headerValue) return headerValue

    if (name === 'host') return 'localhost:3000'
    return undefined
  }),
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ column: 'eq', value: val })),
  and: vi.fn((...conditions) => ({ type: 'and', conditions })),
  gt: vi.fn((_col, val) => ({ column: 'gt', value: val })),
}))

vi.mock('#layer/orm-tables', () => ({
  users: {
    id: 'id',
    email: 'email',
    name: 'name',
    passwordHash: 'password_hash',
    appleId: 'apple_id',
    isAdmin: 'is_admin',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  sessions: { id: 'id', userId: 'user_id', expiresAt: 'expires_at', createdAt: 'created_at' },
  apiKeys: {
    id: 'id',
    userId: 'user_id',
    keyHash: 'key_hash',
    expiresAt: 'expires_at',
    lastUsedAt: 'last_used_at',
  },
}))

describe('auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.select.mockReset()
    mockDb.update.mockReset()
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    })
    mockedGetUserSession.mockResolvedValue(null)
  })

  describe('getSessionUser', () => {
    it('returns null when no session cookie is present', async () => {
      const { getCookie } = await import('h3')
      vi.mocked(getCookie).mockReturnValue()

      const event = { context: {} } as never
      const result = await getSessionUser(event)
      expect(result).toBeNull()
    })
  })

  describe('requireAuth', () => {
    it('throws 401 when no session exists', async () => {
      const { getCookie } = await import('h3')
      vi.mocked(getCookie).mockReturnValue()

      const event = { context: {} } as never
      await expect(requireAuth(event)).rejects.toThrow('Unauthorized')
    })

    it('prefers a valid API key over an ambient session cookie', async () => {
      mockedGetUserSession.mockResolvedValue({
        user: {
          id: 'session-user',
          email: 'session@example.com',
          name: 'Session User',
          isAdmin: false,
        },
      })

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  keyId: 'api-key-id',
                  keyExpiresAt: null,
                  id: 'api-user',
                  email: 'api@example.com',
                  name: 'API User',
                  passwordHash: null,
                  appleId: null,
                  isAdmin: true,
                  createdAt: '2026-03-29T00:00:00.000Z',
                  updatedAt: '2026-03-29T00:00:00.000Z',
                },
              ]),
            }),
          }),
        }),
      })

      const event = {
        context: {},
        node: {
          req: {
            headers: {
              authorization:
                'Bearer nk_fb4883dc05c28dcae4ca769902456240dfbd088ed11555b1960cb061238a4d55',
            },
          },
        },
      } as never

      await expect(requireAuth(event)).resolves.toMatchObject({
        id: 'api-user',
        email: 'api@example.com',
        isAdmin: true,
      })
    })
  })

  describe('requireAdmin', () => {
    it('throws 401 when no session exists (via requireAuth)', async () => {
      const { getCookie } = await import('h3')
      vi.mocked(getCookie).mockReturnValue()

      const event = { context: {} } as never
      await expect(requireAdmin(event)).rejects.toThrow('Unauthorized')
    })
  })
})
