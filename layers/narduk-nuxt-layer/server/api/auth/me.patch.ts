import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '../../database/schema'

/**
 * PATCH /api/auth/me
 *
 * Update the authenticated user's profile (name only by default).
 * Apps can extend this route if they need additional fields.
 */

const bodySchema = z.object({
  name: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const db = useDatabase(event)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  const body = parsed.data

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  }

  if (typeof body.name === 'string') {
    updates.name = body.name.trim()
  }

  await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.id))

  // Refresh session so the sealed cookie reflects the new name
  const session = await getUserSession(event)
  if (session?.user) {
    await replaceUserSession(event, {
      ...session,
      user: {
        ...session.user,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
      },
    })
  }

  return { ok: true }
})
