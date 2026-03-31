#!/usr/bin/env node

const reportStage =
  process.env.APP_OPERATION_REPORT_STAGE || process.env.PLATFORM_REPORT_STAGE || ''

if (reportStage !== 'start' && reportStage !== 'outcome') {
  console.warn(
    'report-app-operation: APP_OPERATION_REPORT_STAGE must be "start" or "outcome"; skipping.',
  )
  process.exit(0)
}

const reportToken = process.env.OPERATION_REPORT_API_KEY || process.env.PROVISION_API_KEY || ''
if (!reportToken) {
  console.warn(
    'report-app-operation: no OPERATION_REPORT_API_KEY or PROVISION_API_KEY configured; skipping.',
  )
  process.exit(0)
}

const repository = process.env.GITHUB_REPOSITORY || ''
const sha = process.env.GITHUB_SHA || ''
const runId = process.env.GITHUB_RUN_ID || ''
const serverUrl = process.env.GITHUB_SERVER_URL || 'https://code.platform.nard.uk'
const workflowFile = process.env.APP_OPERATION_WORKFLOW_FILE || 'deploy-main.yml'
const workflowName = process.env.GITHUB_WORKFLOW || 'Deploy From Main'
const refName = process.env.GITHUB_REF_NAME || 'main'
const trigger = process.env.GITHUB_EVENT_NAME || 'push'
const repoPrimary = process.env.APP_OPERATION_REPO_PRIMARY || 'forgejo'
const reportBase =
  process.env.CONTROL_PLANE_URL || process.env.PLATFORM_APP_URL || 'https://platform.nard.uk'
const appName =
  process.env.APP_OPERATION_APP_NAME ||
  process.env.DOPPLER_PROJECT ||
  repository.split('/').at(-1) ||
  ''

if (!repository || !sha || !runId || !appName) {
  console.warn('report-app-operation: missing repository, sha, run id, or app name; skipping.')
  process.exit(0)
}

const reportUrl = `${reportBase.replace(/\/$/, '')}/api/fleet/operations/report`
const workflowStep = process.env.APP_OPERATION_STEP || workflowFile.replace(/\.[^.]+$/, '')
const requestedBy = process.env.GITHUB_ACTOR || `${repoPrimary}-actions`
const operationId = `run_${appName.replace(/[^a-z0-9_-]/gi, '_')}_${runId}`
const externalUrl = `${serverUrl.replace(/\/$/, '')}/${repository}/actions/runs/${runId}`

const payload = {
  workflow: workflowFile,
  workflowFile,
  workflowName,
  ref: refName,
  branch: refName,
  sha,
  commitSha: sha,
  repoPrimary,
  githubRepo: repoPrimary === 'github' ? repository : null,
  forgejoRepo: repoPrimary === 'forgejo' ? repository : null,
  trigger,
}

const baseBody = {
  id: operationId,
  appName,
  type: 'deploy',
  backend: repoPrimary,
  requestedBy,
  payload,
  externalRunId: runId,
  externalUrl,
  step: workflowStep,
}

const startBody = {
  ...baseBody,
  status: 'running',
  externalRunStatus: 'in_progress',
  logMessage: `Deploy workflow started for ${appName} at ${sha.slice(0, 12)}.`,
  logLevel: 'info',
}

function buildOutcomeBody() {
  const jobStatus = process.env.JOB_STATUS || ''

  if (jobStatus === 'success') {
    return {
      ...baseBody,
      status: 'succeeded',
      externalRunStatus: 'completed',
      externalRunConclusion: 'success',
      logMessage: `Deploy completed for ${appName} at ${sha.slice(0, 12)}.`,
      logLevel: 'success',
    }
  }

  if (jobStatus === 'cancelled') {
    return {
      ...baseBody,
      status: 'canceled',
      externalRunStatus: 'completed',
      externalRunConclusion: 'cancelled',
      errorMessage: 'Deploy workflow was canceled.',
      logMessage: `Deploy canceled for ${appName} at ${sha.slice(0, 12)}.`,
      logLevel: 'warn',
    }
  }

  return {
    ...baseBody,
    status: 'failed',
    externalRunStatus: 'completed',
    externalRunConclusion: 'failure',
    errorMessage: `Deploy workflow ended with ${jobStatus || 'unknown'}.`,
    logMessage: `Deploy failed for ${appName} at ${sha.slice(0, 12)}.`,
    logLevel: 'error',
  }
}

const body = reportStage === 'start' ? startBody : buildOutcomeBody()

const response = await fetch(reportUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${reportToken}`,
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  body: JSON.stringify(body),
})

if (!response.ok) {
  const details = await response.text().catch(() => '')
  console.warn(`report-app-operation: callback failed (${response.status}) ${details}`.trim())
  process.exit(0)
}

console.log(`report-app-operation: reported ${reportStage} for ${appName}@${sha.slice(0, 12)}.`)
