import { PlaywrightCrawler } from '@crawlee/playwright'
import { join } from 'path'
import { CheckpointStore } from './checkpoint-store.mjs'
import { isTerminalPageState, PAGE_STATES } from './page-state.mjs'
import { RateBudget } from './rate-budget.mjs'
import {
  createBoatFindStatement,
  createBoatUpsertStatement,
  ensureCrawlerSchema,
  getBoatDatabaseStats,
  openCrawlerDatabase,
  TelemetryRecorder,
  upsertBoatRecord,
} from './storage.mjs'
import { getSource } from './source-registry.mjs'
import { hashText, normalizeWhitespace } from './utils.mjs'

export async function runSource(sourceKey, env = process.env) {
  const source = getSource(sourceKey)
  const runtime = source.getRuntime(env)
  assertSourceAllowed(source)

  const { db, dbPath, dataDir } = openCrawlerDatabase(env)
  ensureCrawlerSchema(db)

  const checkpoint = new CheckpointStore({
    baseDir: join(dataDir, 'checkpoints'),
    sourceKey,
  })

  const telemetry = new TelemetryRecorder({
    db,
    dataDir,
    sourceKey,
    parserVersion: source.parserVersion,
    fallbackStrategy: source.fallbackStrategy,
  })

  const searchRequests = source
    .buildSearchRequests(runtime)
    .map((item) => (typeof item === 'string' ? { url: item, userData: { pageIndex: 1 } } : item))
  const jobId = telemetry.startJob({
    searchUrl: searchRequests.map((item) => item.url).join('\n'),
  })
  checkpoint.setLastJobId(jobId)

  const upsertBoat = createBoatUpsertStatement(db)
  const findBoatByUrl = createBoatFindStatement(db)
  const rateBudget = new RateBudget(source.rateBudget)

  let sourceStopped = false
  let stopReason = null
  let lastPageState = PAGE_STATES.OK
  let lastUrl = null
  let boatsFound = 0
  let boatsScraped = 0

  telemetry.recordEvent({
    stage: 'job',
    level: 'info',
    eventType: 'job-started',
    message: `Started ${source.displayName} crawl`,
    metadata: {
      dbPath,
      parserVersion: source.parserVersion,
      fallbackStrategy: source.fallbackStrategy,
    },
  })

  const crawler = new PlaywrightCrawler({
    headless: runtime.headless,
    launchContext: {
      launchOptions: {
        args: runtime.launchArgs,
      },
    },
    maxRequestsPerCrawl: runtime.maxRequestsPerCrawl,
    maxConcurrency: runtime.maxConcurrency,
    maxRequestRetries: 0,
    requestHandlerTimeoutSecs: runtime.requestHandlerTimeoutSecs,
    preNavigationHooks: [
      async ({ request, log }) => {
        if (sourceStopped) {
          log.info(`Skipping navigation after compliant stop: ${request.url}`)
          return
        }

        await rateBudget.waitForTurn(request.url)
      },
    ],

    async requestHandler({ request, page, log }) {
      if (sourceStopped) {
        return
      }

      if (!isAllowedRequestUrl(source, request.url)) {
        telemetry.recordEvent({
          url: request.url,
          stage: 'policy',
          level: 'warning',
          eventType: 'disallowed-url',
          message: `Skipped out-of-policy URL: ${request.url}`,
        })
        return
      }

      if (checkpoint.hasProcessed(request.url)) {
        telemetry.recordEvent({
          url: request.url,
          stage: 'checkpoint',
          level: 'info',
          eventType: 'resume-skip',
          message: `Skipping already processed URL: ${request.url}`,
        })
        return
      }

      const pageKind = source.isDetailUrl(request.url) ? 'detail' : 'search'
      const attemptId = telemetry.recordAttemptStart({
        url: request.url,
        pageKind,
        retryCount: request.retryCount || 0,
      })

      const stateResult = await source.detectBlockState({
        request,
        page,
        log,
        runtime,
        isDetail: pageKind === 'detail',
      })

      lastPageState = stateResult.state
      lastUrl = request.url

      if (stateResult.state !== PAGE_STATES.OK) {
        const status = stateResult.state === PAGE_STATES.NO_RESULTS ? 'skipped' : 'blocked'
        const domHash = stateResult.signal?.html ? hashDom(stateResult.signal.html) : null

        telemetry.recordAttemptComplete({
          attemptId,
          status,
          pageState: stateResult.state,
          domHash,
          pageTitle: stateResult.signal?.title || null,
          error: stateResult.reason || stateResult.summary || null,
        })
        telemetry.recordEvent({
          attemptId,
          url: request.url,
          stage: pageKind,
          level: status === 'blocked' ? 'warning' : 'info',
          eventType: `page-state-${stateResult.state}`,
          message:
            stateResult.summary ||
            stateResult.reason ||
            `Detected ${stateResult.state} on ${request.url}`,
          metadata: {
            state: stateResult.state,
            summary: stateResult.summary || null,
          },
        })
        checkpoint.markProcessed(request.url)

        if (stateResult.state !== PAGE_STATES.NO_RESULTS) {
          await telemetry.capturePageArtifacts({
            page,
            attemptId,
            url: request.url,
          })
        }

        if (isTerminalPageState(stateResult.state)) {
          sourceStopped = true
          stopReason = stateResult.summary || stateResult.reason || stateResult.state
          checkpoint.recordStopState({
            url: request.url,
            pageState: stateResult.state,
            reason: stopReason,
          })
          telemetry.recordEvent({
            attemptId,
            url: request.url,
            stage: 'policy',
            level: 'warning',
            eventType: 'source-stopped',
            message: `Stopped ${source.displayName} after ${stateResult.state}`,
            metadata: {
              pageState: stateResult.state,
              fallbackStrategy: source.fallbackStrategy,
            },
          })
          await crawler.autoscaledPool.abort()
        }

        return
      }

      if (pageKind === 'search') {
        const discovery = await source.discoverListings({ request, page, log, runtime })

        boatsFound += discovery.detailRequests.length
        telemetry.recordEvent({
          attemptId,
          url: request.url,
          stage: 'search',
          level: 'info',
          eventType: 'search-discovered',
          message: `Discovered ${discovery.detailRequests.length} detail URLs`,
          metadata: {
            nextPages: discovery.searchRequests.length,
          },
        })

        await enqueueRequests({
          crawler,
          checkpoint,
          source,
          requests: discovery.detailRequests,
        })
        await enqueueRequests({
          crawler,
          checkpoint,
          source,
          requests: discovery.searchRequests,
        })
      } else {
        const boatData = await source.extractDetail({ request, page, log, runtime })
        const acceptance = source.acceptBoatData
          ? source.acceptBoatData(boatData, runtime)
          : acceptBoatRecord(boatData, runtime)

        if (!acceptance.accepted) {
          telemetry.recordAttemptComplete({
            attemptId,
            status: 'skipped',
            pageState: acceptance.pageState || PAGE_STATES.OK,
            domHash: stateResult.signal?.html ? hashDom(stateResult.signal.html) : null,
            pageTitle: stateResult.signal?.title || null,
            error: acceptance.reason,
          })
          telemetry.recordEvent({
            attemptId,
            url: request.url,
            stage: 'detail',
            level: acceptance.pageState === PAGE_STATES.PARSER_CHANGED ? 'warning' : 'info',
            eventType: 'detail-skipped',
            message: acceptance.reason,
          })
          checkpoint.markProcessed(request.url)

          if (acceptance.pageState === PAGE_STATES.PARSER_CHANGED) {
            await telemetry.capturePageArtifacts({ page, attemptId, url: request.url })
            sourceStopped = true
            stopReason = acceptance.reason
            checkpoint.recordStopState({
              url: request.url,
              pageState: PAGE_STATES.PARSER_CHANGED,
              reason: acceptance.reason,
            })
            await crawler.autoscaledPool.abort()
          }

          return
        }

        const saveAction = upsertBoatRecord({
          db,
          upsertStatement: upsertBoat,
          findStatement: findBoatByUrl,
          boatData,
          searchContext: runtime.searchContext,
        })

        boatsScraped += 1
        telemetry.recordAttemptComplete({
          attemptId,
          status: saveAction,
          pageState: PAGE_STATES.OK,
          domHash: stateResult.signal?.html ? hashDom(stateResult.signal.html) : null,
          pageTitle: stateResult.signal?.title || null,
        })
        telemetry.recordEvent({
          attemptId,
          url: request.url,
          stage: 'detail',
          level: 'info',
          eventType: 'detail-saved',
          message: `${saveAction === 'inserted' ? 'Inserted' : 'Updated'} ${boatLabel(boatData)}`,
        })
      }

      checkpoint.markProcessed(request.url)
    },

    async failedRequestHandler({ request, error, log }) {
      log.error(`Failed request for ${request.url}: ${error.message}`)
      telemetry.recordEvent({
        url: request.url,
        stage: 'request',
        level: 'error',
        eventType: 'failed-request',
        message: error.message,
      })
      checkpoint.markProcessed(request.url)
    },
  })

  try {
    await enqueueRequests({
      crawler,
      checkpoint,
      source,
      requests: searchRequests,
    })
    await crawler.run()

    const status = sourceStopped ? 'stopped' : 'completed'
    telemetry.finishJob({
      status,
      boatsFound,
      boatsScraped,
      stopReason,
      lastPageState,
      lastUrl,
    })
    telemetry.recordEvent({
      stage: 'job',
      level: sourceStopped ? 'warning' : 'info',
      eventType: 'job-finished',
      message: `${source.displayName} finished with status ${status}`,
      metadata: {
        boatsFound,
        boatsScraped,
        stopReason,
      },
    })

    const stats = getBoatDatabaseStats(db)
    return {
      sourceKey,
      status,
      boatsFound,
      boatsScraped,
      stopReason,
      dbStats: stats,
    }
  } catch (error) {
    telemetry.finishJob({
      status: 'failed',
      boatsFound,
      boatsScraped,
      stopReason,
      lastPageState,
      lastUrl,
      error: error.message,
    })
    telemetry.recordEvent({
      stage: 'job',
      level: 'error',
      eventType: 'job-failed',
      message: error.message,
    })
    throw error
  } finally {
    db.close()
  }
}

async function enqueueRequests({ crawler, checkpoint, source, requests }) {
  const newRequests = []

  for (const request of requests) {
    const normalized = typeof request === 'string' ? { url: request } : request
    if (!normalized?.url) {
      continue
    }
    if (!isAllowedRequestUrl(source, normalized.url)) {
      continue
    }
    if (checkpoint.hasSeen(normalized.url)) {
      continue
    }

    checkpoint.markQueued(normalized.url)
    newRequests.push(normalized)
  }

  if (newRequests.length > 0) {
    await crawler.addRequests(newRequests)
  }
}

function assertSourceAllowed(source) {
  if (source.policyStatus !== 'allow') {
    throw new Error(
      `${source.displayName} is not allow-listed for automated crawling. Fallback: ${source.fallbackStrategy}`,
    )
  }
}

function isAllowedRequestUrl(source, url) {
  try {
    const parsed = new URL(url)
    return source.allowedHosts.includes(parsed.hostname)
  } catch {
    return false
  }
}

function acceptBoatRecord(boatData, runtime) {
  if (!boatData?.url) {
    return {
      accepted: false,
      pageState: PAGE_STATES.PARSER_CHANGED,
      reason: 'Missing boat URL during detail extraction',
    }
  }

  if (!boatData.make && !boatData.model) {
    return {
      accepted: false,
      pageState: PAGE_STATES.PARSER_CHANGED,
      reason: 'Missing make/model during detail extraction',
    }
  }

  const length = parseFloat(boatData.length || '0')
  if (length > 0) {
    if (runtime.searchContext.lengthMin && length < runtime.searchContext.lengthMin) {
      return { accepted: false, reason: `Length ${length}ft below minimum` }
    }
    if (runtime.searchContext.lengthMax && length > runtime.searchContext.lengthMax) {
      return { accepted: false, reason: `Length ${length}ft above maximum` }
    }
  }

  const price = parseInt(boatData.price || '0', 10)
  if (price > 0 && runtime.maxPrice && price > runtime.maxPrice) {
    return { accepted: false, reason: `Price $${price.toLocaleString()} above maximum` }
  }

  if (runtime.requiredState && runtime.requiredState !== '*') {
    const haystack = normalizeWhitespace(
      `${boatData.location || ''} ${boatData.city || ''} ${boatData.state || ''}`,
    ).toLowerCase()
    const match = runtime.requiredState.toLowerCase()
    if (!haystack.includes(match) && !(match === 'texas' && /\btx\b/.test(haystack))) {
      return { accepted: false, reason: `Listing not in required region: ${runtime.requiredState}` }
    }
  }

  return { accepted: true }
}

function boatLabel(boatData) {
  return normalizeWhitespace(
    `${boatData.year || ''} ${boatData.make || ''} ${boatData.model || ''}`,
  )
}

function hashDom(value) {
  return hashText(value)
}
