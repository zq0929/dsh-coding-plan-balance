/**
 * Host half of the Coding Plan balance widget.
 *
 * Reads the Ctrip Coding Plan quota with the credential this profile already
 * uses for its `ctrip` model provider, caches one snapshot, and publishes it to
 * the page through an authenticated exact Fetch route. The same snapshot is
 * exposed to the agent as the `coding_plan_balance` tool, so the UI action and
 * the tool share one implementation.
 */

/** Loader entry identity, matching the row id in `cordis.patch.yml`. */
export const name = 'coding-plan-balance'

/** The widget needs the browser Fetch carrier; the tool registry stays optional. */
export const inject = ['connection']

const QUOTA_PATH = '/api/coding-plan/quota/me'
const FIVE_HOUR_PATH = '/api/coding-plan/5h-usage'
const USERINFO_PATH = '/api/user/api-tokens/userinfo'

const NAME = 'coding_plan_balance'

const DEFAULTS = {
  baseUrl: 'https://ada-cli-go.ctripcorp.com',
  fallbackBaseUrl: 'http://ada-cli-golang.ctripcorp.com',
  apiKeyEnv: 'CTRIP_API_KEY',
  apiKey: '',
  routePath: '/api/coding-plan.balance',
  timeoutMs: 8000,
  /** Reuse window for the route, so several sessions polling share one request. */
  cacheSeconds: 10,
  /** How often the pill asks again; travels to the page inside the snapshot. */
  refreshSeconds: 60,
  tool: true,
}

/** Canonical value of a successful read, enforced by the tool registry. */
const SNAPSHOT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'Whether the read succeeded.' },
    fetchedAt: { type: 'string', description: 'ISO8601 time of this read.' },
    error: { type: 'string', description: 'Failure reason when ok is false.' },
    code: { type: 'string', description: 'Machine-readable failure code.' },
    planName: { type: 'string', description: 'Plan display name.' },
    planType: { type: 'string', description: 'Plan type key.' },
    planStatus: { type: 'string', description: 'Plan status.' },
    usedUsd: { type: 'number', description: 'USD used in the current billing cycle.' },
    limitUsd: { type: 'number', description: 'USD limit of the current billing cycle.' },
    remainingUsd: { type: 'number', description: 'USD left in the current billing cycle.' },
    percent: { type: 'integer', description: 'Integer share of the cycle limit already used.' },
    resetAt: { type: 'string', description: 'ISO8601 cycle reset time.' },
    isBlocked: { type: 'boolean', description: 'Whether a quota limit currently blocks the plan.' },
    fiveHourEnabled: { type: 'boolean', description: 'Whether the rolling 5-hour limit is enabled.' },
    fiveHourSource: { type: 'string', description: '`redis` for an active 5-hour window, `none` otherwise.' },
    fiveHourUsedUsd: { type: 'number', description: 'USD used in the current 5-hour window.' },
    fiveHourRemainingUsd: { type: 'number', description: 'USD left in the current 5-hour window.' },
    fiveHourLimitUsd: { type: 'number', description: 'Effective 5-hour window limit in USD; 0 means unconfigured.' },
    fiveHourWindowStartAt: { type: 'string', description: 'ISO8601 5-hour window start.' },
    fiveHourWindowEndAt: { type: 'string', description: 'ISO8601 5-hour window end.' },
    userId: { type: 'string', description: 'Employee id of the credential owner.' },
    userName: { type: 'string', description: 'Display name of the credential owner.' },
    department: { type: 'string', description: 'Department of the credential owner.' },
    refreshSeconds: { type: 'integer', description: 'Suggested poll interval for the widget.' },
  },
  additionalProperties: true,
}

/**
 * Register the balance route and, when the tool registry is mounted, the tool.
 * @param ctx - Host context carrying the connection service.
 * @param config - optional overrides from the profile patch.
 */
export function apply(ctx, config) {
  const cfg = resolveConfig(config)
  /** Latest snapshot and its read time; `pending` collapses concurrent reads. */
  const state = { snapshot: undefined, at: 0, pending: undefined }

  async function read(options = {}) {
    const force = options.force === true
    if (!force && state.snapshot !== undefined && Date.now() - state.at < cfg.cacheSeconds * 1000) {
      return state.snapshot
    }
    if (state.pending !== undefined) return state.pending
    state.pending = (async () => {
      let snapshot
      try {
        const apiKey = await resolveApiKey(ctx, cfg)
        snapshot = apiKey === ''
          ? failure('no-key', `No Coding Plan credential: set ${cfg.apiKeyEnv} for this profile or configure apiKey.`)
          : await collect(cfg, apiKey, options.signal)
      } catch (error) {
        snapshot = failure('request-failed', describeError(error))
      }
      state.snapshot = snapshot
      state.at = Date.now()
      state.pending = undefined
      return snapshot
    })()
    return state.pending
  }

  ctx.effect(() => ctx.connection.fetch.register({
    path: cfg.routePath,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const force = new URL(request.url).searchParams.get('refresh') === '1'
      const snapshot = await read({ force, signal: request.signal })
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
    },
  }), 'coding-plan-balance: fetch route')

  const tools = ctx.get('tools')
  if (cfg.tool && tools !== undefined) {
    ctx.effect(() => tools.register({
      name: NAME,
      description: 'Read this profile\'s Ctrip Coding Plan quota: the current billing cycle\'s USD usage and limit, its reset time, and the rolling 5-hour window usage. Use it when the user asks how much Coding Plan quota is left.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: {
        schema: SNAPSHOT_SCHEMA,
        render: (_args, value) => [{ type: 'text', text: summarize(value) }],
      },
      execute: (_args, exec) => read({ force: true, signal: exec.signal }),
    }), 'coding-plan-balance: tool')
  }
}

/**
 * Read the deployment knobs off the row config, keeping defaults for anything
 * absent or mistyped.
 * @param config - raw row config.
 * @returns the resolved settings.
 */
function resolveConfig(config) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  const text = (key, fallback) => {
    const value = raw[key]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
  }
  const positive = (key, fallback) => {
    const value = raw[key]
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  }
  return {
    baseUrl: text('baseUrl', DEFAULTS.baseUrl),
    fallbackBaseUrl: text('fallbackBaseUrl', DEFAULTS.fallbackBaseUrl),
    apiKeyEnv: text('apiKeyEnv', DEFAULTS.apiKeyEnv),
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : DEFAULTS.apiKey,
    routePath: text('routePath', DEFAULTS.routePath),
    timeoutMs: positive('timeoutMs', DEFAULTS.timeoutMs),
    cacheSeconds: positive('cacheSeconds', DEFAULTS.cacheSeconds),
    refreshSeconds: positive('refreshSeconds', DEFAULTS.refreshSeconds),
    tool: raw.tool !== false,
  }
}

/**
 * Resolve the Coding Plan credential the `ctrip` model provider uses: an
 * explicit config value first, then the credential store behind `apiKeyEnv`,
 * then the process environment.
 * @param ctx - Host context, read for the optional credential service.
 * @param cfg - resolved settings.
 * @returns the API key, or an empty string while unconfigured.
 */
async function resolveApiKey(ctx, cfg) {
  if (cfg.apiKey !== '') return cfg.apiKey
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    try {
      const resolved = await credentials.resolve(cfg.apiKeyEnv)
      const value = resolved === undefined ? undefined : resolved.value
      if (typeof value === 'string' && value.trim() !== '') return value.trim()
    } catch {
      // An unavailable credential store falls through to the process env.
    }
  }
  const fromEnv = process.env[cfg.apiKeyEnv]
  return typeof fromEnv === 'string' ? fromEnv.trim() : ''
}

/**
 * Collect one snapshot, retrying the configured alternate host once when the
 * primary is unreachable.
 * @param cfg - resolved settings.
 * @param apiKey - resolved Coding Plan credential.
 * @param signal - caller cancellation.
 * @returns the normalized snapshot.
 */
async function collect(cfg, apiKey, signal) {
  try {
    return await collectFrom(cfg.baseUrl, cfg, apiKey, signal)
  } catch (error) {
    if (cfg.fallbackBaseUrl === '' || cfg.fallbackBaseUrl === cfg.baseUrl) throw error
    return collectFrom(cfg.fallbackBaseUrl, cfg, apiKey, signal)
  }
}

/**
 * Collect one snapshot from one host: the cycle quota is required, the 5-hour
 * window and the user profile are best-effort.
 * @param base - API origin.
 * @param cfg - resolved settings.
 * @param apiKey - resolved Coding Plan credential.
 * @param signal - caller cancellation.
 * @returns the normalized snapshot.
 */
async function collectFrom(base, cfg, apiKey, signal) {
  const request = (path) => requestJson(base, path, apiKey, cfg, signal)
  const [quota, fiveHour, user] = await Promise.allSettled([
    request(QUOTA_PATH),
    request(FIVE_HOUR_PATH),
    request(USERINFO_PATH),
  ])
  if (quota.status === 'rejected') throw quota.reason
  const cycle = record(quota.value)
  const window5h = fiveHour.status === 'fulfilled' ? record(fiveHour.value) : {}
  const profile = user.status === 'fulfilled' ? record(user.value) : {}
  const limitUsd = number(cycle.limitUsd)
  const usedUsd = number(cycle.usedUsd)
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    error: '',
    code: '',
    planName: string(cycle.planName),
    planType: string(cycle.planType),
    planStatus: string(cycle.planStatus),
    usedUsd,
    limitUsd,
    remainingUsd: number(cycle.remainingUsd, Math.max(0, limitUsd - usedUsd)),
    percent: Math.round(number(cycle.percent)),
    resetAt: string(cycle.resetAt),
    isBlocked: cycle.isBlocked === true,
    fiveHourEnabled: window5h.enabled === true,
    fiveHourSource: string(window5h.source),
    fiveHourUsedUsd: number(window5h.used_usd),
    fiveHourRemainingUsd: number(window5h.remaining_usd),
    fiveHourLimitUsd: number(window5h.limit_usd),
    fiveHourWindowStartAt: string(window5h.window_start_at),
    fiveHourWindowEndAt: string(window5h.window_end_at),
    userId: string(profile.userId),
    userName: string(profile.userName),
    department: string(profile.department),
    refreshSeconds: Math.round(cfg.refreshSeconds),
  }
}

/**
 * Issue one authenticated JSON request.
 * @param base - API origin.
 * @param path - request path.
 * @param apiKey - Coding Plan credential.
 * @param cfg - resolved settings.
 * @param signal - caller cancellation.
 * @returns the unwrapped `data` payload.
 */
async function requestJson(base, path, apiKey, cfg, signal) {
  const timeout = AbortSignal.timeout(cfg.timeoutMs)
  const combined = signal === undefined || typeof AbortSignal.any !== 'function'
    ? timeout
    : AbortSignal.any([signal, timeout])
  const response = await fetch(new URL(path, base), {
    headers: { accept: 'application/json', 'x-api-key': apiKey },
    signal: combined,
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    // A non-JSON body is reported by status below; the raw text never helps.
    body = undefined
  }
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}${messageOf(body)}`)
  if (body === undefined || typeof body !== 'object') throw new Error(`${path} returned a non-JSON body`)
  if (body.success === false) throw new Error(`${path} was rejected${messageOf(body)}`)
  return body.data === undefined ? body : body.data
}

/** Build a failed snapshot. */
function failure(code, error) {
  return {
    ok: false,
    fetchedAt: new Date().toISOString(),
    error,
    code,
    planName: '',
    planType: '',
    planStatus: '',
    usedUsd: 0,
    limitUsd: 0,
    remainingUsd: 0,
    percent: 0,
    resetAt: '',
    isBlocked: false,
    fiveHourEnabled: false,
    fiveHourSource: '',
    fiveHourUsedUsd: 0,
    fiveHourRemainingUsd: 0,
    fiveHourLimitUsd: 0,
    fiveHourWindowStartAt: '',
    fiveHourWindowEndAt: '',
    userId: '',
    userName: '',
    department: '',
    refreshSeconds: Math.round(DEFAULTS.refreshSeconds),
  }
}

/** Model-facing reading of one snapshot. */
function summarize(value) {
  if (value.ok !== true) return `Coding Plan quota unavailable: ${value.error}`
  const lines = [
    `Plan: ${value.planName === '' ? '(unnamed)' : value.planName} (${value.planStatus === '' ? 'unknown status' : value.planStatus})`,
    `Cycle: $${value.usedUsd.toFixed(2)} used of $${value.limitUsd.toFixed(2)} (${value.percent}%), $${value.remainingUsd.toFixed(2)} left, resets ${value.resetAt === '' ? 'unknown' : value.resetAt}`,
  ]
  if (value.fiveHourEnabled) {
    const limit = value.fiveHourLimitUsd > 0 ? `$${value.fiveHourLimitUsd.toFixed(2)}` : 'unconfigured'
    lines.push(`5-hour window: $${value.fiveHourUsedUsd.toFixed(2)} used of ${limit}, $${value.fiveHourRemainingUsd.toFixed(2)} left, ends ${value.fiveHourWindowEndAt === '' ? 'unknown' : value.fiveHourWindowEndAt}`)
  } else {
    lines.push('5-hour window limit is disabled.')
  }
  if (value.isBlocked) lines.push('A quota limit currently blocks this plan.')
  return lines.join('\n')
}

/** Narrow an unknown payload to a plain record. */
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/** Read a finite number, or the fallback. */
function number(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Read a string, or an empty string. */
function string(value) {
  return typeof value === 'string' ? value : ''
}

/** Append the API's own message to a diagnostic when it carries one. */
function messageOf(body) {
  if (body === null || typeof body !== 'object') return ''
  const message = body.message
  return typeof message === 'string' && message !== '' ? `: ${message}` : ''
}

/** Describe a thrown value for the page and the model. */
function describeError(error) {
  if (error instanceof Error) {
    return error.name === 'TimeoutError' ? 'The Coding Plan API timed out.' : error.message
  }
  return String(error)
}
