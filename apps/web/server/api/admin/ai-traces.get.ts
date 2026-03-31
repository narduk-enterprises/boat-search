import { desc, eq, isNotNull, sql } from 'drizzle-orm'
import { requireAdmin } from '#layer/server/utils/auth'
import { recommendationSessions, users } from '~~/server/database/schema'
import { recommendationAiTraceSchema } from '~~/lib/boatFinder'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useAppDatabase(event)

  const rows = await db
    .select({
      id: recommendationSessions.id,
      createdAt: recommendationSessions.createdAt,
      userId: recommendationSessions.userId,
      userEmail: users.email,
      userName: users.name,
      buyerProfileId: recommendationSessions.buyerProfileId,
      buyerProfileNameSnapshot: recommendationSessions.buyerProfileNameSnapshot,
      aiTraceJson: recommendationSessions.aiTraceJson,
    })
    .from(recommendationSessions)
    .leftJoin(users, eq(recommendationSessions.userId, users.id))
    .where(isNotNull(recommendationSessions.aiTraceJson))
    .orderBy(desc(recommendationSessions.createdAt))
    .limit(100)

  const traces = rows
    .map((row) => {
      if (!row.aiTraceJson) return null

      try {
        const trace = recommendationAiTraceSchema.parse(JSON.parse(row.aiTraceJson))

        return {
          sessionId: row.id,
          createdAt: row.createdAt,
          userEmail: row.userEmail ?? 'unknown',
          userName: row.userName ?? null,
          buyerProfileId: row.buyerProfileId,
          buyerProfileName: row.buyerProfileNameSnapshot ?? null,

          // Trace summary fields
          attemptedAt: trace.attemptedAt,
          status: trace.status,
          errorMessage: trace.errorMessage,

          // Request summary
          candidateCount: trace.request.candidateBoatIds.length,
          candidateBoatIds: trace.request.candidateBoatIds,
          relaxedConstraints: trace.request.relaxedConstraints,
          temperature: trace.request.options.temperature,
          maxTokens: trace.request.options.maxTokens,
          reasoningEffort: trace.request.options.reasoningEffort,

          // Response summary
          model: trace.response.model,
          selectionSource: trace.response.selectionSource,
          tokensUsed: trace.response.tokensUsed,
          hasRecommendations: (trace.response.parsedSummary?.recommendations?.length ?? 0) > 0,
          recommendationCount: trace.response.parsedSummary?.recommendations?.length ?? 0,
          avoidCount: trace.response.parsedSummary?.boatsToAvoid?.length ?? 0,

          // Full data for detail panel
          systemPrompt: trace.request.messages[0]?.content ?? '',
          userPrompt: trace.request.messages[1]?.content ?? '',
          rawResponse: trace.response.rawText,
          parsedSummary: trace.response.parsedSummary,
        }
      } catch {
        return null
      }
    })
    .filter((trace): trace is NonNullable<typeof trace> => trace !== null)

  // Aggregate stats
  const [statsRow] = await db
    .select({
      totalSessions: sql<number>`COUNT(*)`,
      tracedSessions: sql<number>`SUM(CASE WHEN ${recommendationSessions.aiTraceJson} IS NOT NULL THEN 1 ELSE 0 END)`,
    })
    .from(recommendationSessions)

  const stats = {
    totalSessions: statsRow?.totalSessions ?? 0,
    tracedSessions: statsRow?.tracedSessions ?? 0,
    successCount: traces.filter((t) => t.status === 'success').length,
    parseFailedCount: traces.filter((t) => t.status === 'parse-failed').length,
    requestFailedCount: traces.filter((t) => t.status === 'request-failed').length,
    totalTokensUsed: traces.reduce((sum, t) => sum + (t.tokensUsed ?? 0), 0),
  }

  return { traces, stats }
})
