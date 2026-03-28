import { requireAdmin } from '#layer/server/utils/auth'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)

  return {
    authenticated: true,
    user: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
    imageUploadEnabled: Boolean(event.context.cloudflare?.env?.BUCKET),
    uploadEndpoint: '/api/upload',
  }
})
