/**
 * Browser half of the Coding Plan balance widget. One shared snapshot feeds two
 * seats: the cycle total under the composer (`conversation.composer.dock`) and
 * the auto-model bucket in the Session header (`conversation.session.header.
 * utilities`). Both poll the Host's own authenticated route.
 */

window.__ModuleLoader__.load({
  id: 'dsh-coding-plan-balance',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace the registrations' seats bind to. */
    const NS = 'codingPlanBalance'

    const DICT = {
      zh: {
        plan: 'Coding Plan',
        loading: '额度读取中',
        error: '额度读取失败',
        noKey: '未配置 Coding Plan Key',
        blocked: '已超额',
        fiveHour: '5h',
        cycle: '周期',
        remaining: '剩余',
        reset: '重置',
        windowEndsAt: '窗口结束',
        updatedAt: '更新于',
        refreshHint: '点击刷新',
        unlimited: '不限',
        auto: 'auto',
        advanced: '高阶',
        today: '今日',
        autoUsedUp: 'auto 已用尽',
        alertAt: '告警',
      },
      en: {
        plan: 'Coding Plan',
        loading: 'Reading quota',
        error: 'Quota unavailable',
        noKey: 'Coding Plan key missing',
        blocked: 'over quota',
        fiveHour: '5h',
        cycle: 'Cycle',
        remaining: 'Left',
        reset: 'Resets',
        windowEndsAt: 'Window ends',
        updatedAt: 'Updated',
        refreshHint: 'Click to refresh',
        unlimited: 'no limit',
        auto: 'auto',
        advanced: 'High-cost',
        today: 'Today',
        autoUsedUp: 'auto used up',
        alertAt: 'alert at',
      },
    }

    const CSS = [
      '.dshcp-anchor{display:inline-flex;align-items:center;min-width:0;max-width:180px;',
      'font-size:12px;line-height:22px}',
      '.dshcp-anchor.dshcp-wide{max-width:none}',
      '.dshcp-pill{display:inline-flex;align-items:center;gap:4px;box-sizing:border-box;max-width:100%;height:22px;',
      'padding:0 6px;border:none;border-radius:var(--dsw-radius-xs);background:transparent;',
      'color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;',
      'white-space:nowrap;overflow:hidden;cursor:pointer}',
      '.dshcp-pill:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.dshcp-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshcp-pill[data-state="blocked"]{color:var(--dsw-alias-state-warn-primary)}',
      '.dshcp-pill[data-state="error"]{color:var(--dsw-alias-state-error-primary)}',
      '.dshcp-pill svg{width:13px;height:13px;flex:none}',
      '.dshcp-label{min-width:0;overflow:hidden;text-overflow:ellipsis}',
      // The title row is an inline-size container; narrow rows shed the text
      // first, keeping the icon (and the tooltip) clickable.
      '@container (max-width: 560px){.dshcp-label{display:none}.dshcp-pill{padding:0 4px}}',
      '.dshcp-busy{animation:dshcp-spin 1s linear infinite}',
      '@keyframes dshcp-spin{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion: reduce){.dshcp-busy{animation:none}}',
    ].join('')

    /**
     * Ask the Host for one snapshot through the document-relative
     * authenticated route the connection service owns.
     * @param force - bypass the Host's short reuse window.
     * @param signal - abort signal owned by the caller.
     * @returns the parsed snapshot payload.
     */
    async function requestSnapshot(force, signal) {
      const url = new URL('api/coding-plan.balance', document.baseURI)
      if (force) url.searchParams.set('refresh', '1')
      const response = await fetch(url.toString(), {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal,
      })
      const text = await response.text()
      let body
      try {
        body = JSON.parse(text)
      } catch {
        // A non-JSON body means the request never reached the plugin route.
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim())
      }
      if (body === null || typeof body !== 'object') throw new Error(`HTTP ${response.status}`)
      return body
    }

    /** Format a USD amount. */
    function usd(value) {
      return `$${(typeof value === 'number' && Number.isFinite(value) ? value : 0).toFixed(2)}`
    }

    /** Format a USD limit, naming the unconfigured case. */
    function limit(value, t) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? usd(value) : t('unlimited')
    }

    /** Compact USD amount: cents only when they carry information. */
    function amount(value) {
      const rounded = Math.round((typeof value === 'number' && Number.isFinite(value) ? value : 0) * 100) / 100
      return `$${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)}`
    }

    /** Compact limit, naming the unconfigured case. */
    function amountLimit(value, t) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? amount(value) : t('unlimited')
    }

    /** Integer percentage, defaulting to 0 for a value the API omitted. */
    function pct(value) {
      return Number.isFinite(value) ? Math.round(value) : 0
    }

    /** Local wall-clock rendering of an ISO timestamp. */
    function localTime(value) {
      if (typeof value !== 'string' || value === '') return '—'
      const at = new Date(value)
      return Number.isNaN(at.getTime()) ? value : at.toLocaleString()
    }

    /** Reading of a thrown value. */
    function describe(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /**
     * One shared reading for both seats: two independent pollers would double
     * the Host traffic, and the click-to-refresh gesture should refresh what
     * both seats display. Polling starts with the first subscriber and stops
     * with the last one.
     */
    const store = (() => {
      let state = { phase: 'idle', value: null, error: '' }
      let pending = null
      let timer = null
      let interval = 60
      const listeners = new Set()

      const emit = () => {
        const snapshot = state
        listeners.forEach((listener) => {
          listener(snapshot)
        })
      }
      const apply = (next) => {
        state = next
        emit()
      }
      const clearTimer = () => {
        if (timer !== null) {
          window.clearInterval(timer)
          timer = null
        }
      }
      const armTimer = () => {
        clearTimer()
        timer = window.setInterval(() => {
          void load(false)
        }, Math.max(20, interval) * 1000)
      }

      function load(force) {
        // Coalesce overlapping reads: a reuse-window read and a forced one must
        // not race each other into the same route.
        if (pending !== null) return pending
        if (state.phase !== 'ready') apply({ ...state, phase: 'loading' })
        pending = requestSnapshot(force, new AbortController().signal)
          .then((value) => {
            const seconds = Number(value.refreshSeconds)
            interval = Number.isFinite(seconds) && seconds >= 20 ? seconds : 60
            apply({
              phase: 'ready',
              value,
              error: value.ok === true ? '' : (typeof value.error === 'string' ? value.error : ''),
            })
          })
          .catch((error) => {
            apply({ phase: 'ready', value: null, error: describe(error) })
          })
          .then(() => {
            pending = null
            if (listeners.size > 0) armTimer()
          })
        return pending
      }

      return {
        get: () => state,
        subscribe(listener) {
          listeners.add(listener)
          if (listeners.size === 1) {
            armTimer()
            void load(true)
          }
          return () => {
            listeners.delete(listener)
            if (listeners.size === 0) clearTimer()
          }
        },
        refresh: (force) => load(force),
      }
    })()

    /** The shared snapshot, re-rendered on every poll. */
    function useSnapshot() {
      const [state, setState] = React.useState(store.get())
      React.useEffect(() => {
        setState(store.get())
        return store.subscribe(setState)
      }, [])
      return state
    }

    /** A quarter-gauge mark; the artwork carries its own shape, not a theme token. */
    function GaugeIcon(props) {
      return h('svg', {
        viewBox: '0 0 16 16', width: 13, height: 13, 'aria-hidden': true, focusable: false,
        className: props.className,
      },
      h('path', {
        d: 'M2.75 11.25a5.25 5.25 0 1 1 10.5 0', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, strokeLinecap: 'round',
      }),
      h('path', {
        d: 'M8 11.25 10.25 7.5', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, strokeLinecap: 'round',
      }))
    }

    /** Readings the component derives once per render. */
    function read(state) {
      const value = state.value
      const ok = value !== null && value.ok === true
      const autoExhausted = ok && value.autoExhausted === true
      return {
        value,
        ok,
        autoExhausted,
        blocked: ok && (value.isBlocked === true || autoExhausted),
        loading: state.phase === 'loading' || state.phase === 'idle',
        missingKey: !ok && value !== null && value.code === 'no-key',
        showAuto: ok && (value.autoEnabled === true || value.autoUsedUsd > 0),
        showAdvanced: ok && (value.advancedEnabled === true || value.advancedUsedUsd > 0),
      }
    }

    /** The full reading both tooltips show. */
    function readout(reading, state, t) {
      const { value, ok, autoExhausted, showAuto, showAdvanced } = reading
      const detail = []

      if (ok) {
        detail.push(`${value.planName === '' ? t('plan') : value.planName} · ${value.planStatus === '' ? '—' : value.planStatus}`)
        detail.push(`${t('cycle')} ${usd(value.usedUsd)} / ${limit(value.limitUsd, t)} (${pct(value.percent)}%)`)
        detail.push(`${t('remaining')} ${usd(value.remainingUsd)}`)
        if (showAuto) {
          detail.push(`${t('auto')} ${usd(value.autoUsedUsd)} / ${limit(value.autoLimitUsd, t)} (${pct(value.autoPercent)}%)`)
          if (autoExhausted) detail.push(t('autoUsedUp'))
        }
        if (showAdvanced) {
          detail.push(`${t('advanced')} ${usd(value.advancedUsedUsd)} / ${limit(value.advancedLimitUsd, t)} (${pct(value.advancedPercent)}%)`)
        }
        detail.push(`${t('today')} ${usd(value.todayUsedUsd)} (${pct(value.todayPercent)}%), ${t('alertAt')} ${pct(value.todayAlertPercent)}%`)
        detail.push(`${t('reset')} ${localTime(value.resetAt)}`)
        if (value.fiveHourEnabled) {
          detail.push(`${t('fiveHour')} ${usd(value.fiveHourUsedUsd)} / ${limit(value.fiveHourLimitUsd, t)}`)
          // Only an active window has a real end time; `none` reports a display fallback.
          if (value.fiveHourSource === 'redis') {
            detail.push(`${t('windowEndsAt')} ${localTime(value.fiveHourWindowEndAt)}`)
          }
        }
        detail.push(`${t('updatedAt')} ${localTime(value.fetchedAt)}`)
      } else if (state.error !== '') {
        detail.push(state.error)
      }
      if (value !== null && value.userName !== undefined && value.userName !== '') detail.push(value.userName)
      detail.push(t('refreshHint'))
      return detail.join('\n')
    }

    /** One seat's button, with the shared polling and the full tooltip. */
    function Chip(props) {
      const { label, reading, title, marker, className } = props
      const loading = reading.loading
      return h('span', { className: `dshcp-anchor${className === undefined ? '' : ` ${className}`}` },
        h('button', {
          type: 'button',
          className: 'dshcp-pill',
          'data-state': loading ? 'loading' : reading.ok ? (reading.blocked ? 'blocked' : 'ready') : 'error',
          'data-coding-plan-balance': marker,
          title,
          // The visible run is terse by design, so the accessible name is the
          // same complete reading the tooltip shows.
          'aria-label': title.replace(/\n/g, ' · '),
          onClick: () => {
            void store.refresh(true)
          },
        },
        h(GaugeIcon, { className: loading ? 'dshcp-busy' : undefined }),
        h('span', { className: 'dshcp-label' }, label)))
    }

    /**
     * Composer-dock seat: the cycle's total usage, one short run so it stays
     * readable beside the shipped activity/usage entries.
     */
    function CycleDock(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => (DICT.en[key] !== undefined ? DICT.en[key] : key)
      const state = useSnapshot()
      const reading = read(state)
      const title = readout(reading, state, t)
      const { value, ok, loading, missingKey } = reading
      let label

      if (ok) {
        label = `${t('cycle')} ${usd(value.usedUsd)} / ${limit(value.limitUsd, t)} (${pct(value.percent)}%)`
        if (value.isBlocked === true) label = `${label} · ${t('blocked')}`
      } else if (loading) {
        label = t('loading')
      } else {
        label = missingKey ? t('noKey') : t('error')
      }

      return h(React.Fragment, null,
        h('style', { key: 'style' }, CSS),
        h(Chip, {
          label,
          reading,
          title,
          marker: 'cycle',
          className: 'dshcp-wide',
        }))
    }

    /**
     * Header seat: the auto-model bucket, which is what an `auto(free)` model
     * actually spends. Plans without that bucket keep the header clean — the
     * cycle total already sits in the composer dock.
     */
    function AutoChip(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => (DICT.en[key] !== undefined ? DICT.en[key] : key)
      const state = useSnapshot()
      const reading = read(state)
      const { value, ok, autoExhausted } = reading

      // Nothing to say before the first reading, or when the plan has no auto
      // bucket: the sibling seat already covers the cycle.
      if (state.phase === 'idle' || (ok && !reading.showAuto)) return null

      const title = readout(reading, state, t)
      let label

      if (ok) {
        label = `${t('auto')} ${amount(value.autoUsedUsd)}/${amountLimit(value.autoLimitUsd, t)}`
        if (autoExhausted) label = `${label} · ${t('autoUsedUp')}`
      } else if (reading.loading) {
        label = t('loading')
      } else {
        label = reading.missingKey ? t('noKey') : t('error')
      }

      return h(React.Fragment, null,
        h('style', { key: 'style' }, CSS),
        h(Chip, {
          label,
          reading,
          title,
          marker: 'auto',
        }))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale !== undefined) {
          ctx.effect(() => locale.register(NS, 'zh', DICT.zh), 'coding-plan-balance: zh dictionary')
          ctx.effect(() => locale.register(NS, 'en', DICT.en), 'coding-plan-balance: en dictionary')
        }
        // Total usage belongs under the composer, where the shipped activity
        // and usage pills already sit.
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'coding-plan-balance',
          order: 2,
          locale: NS,
        }, CycleDock))
        // The auto bucket is a header-level reading: always on screen, no
        // vertical cost.
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'coding-plan-balance-header',
          order: 10,
          locale: NS,
        }, AutoChip))
      },
    }
  },
})
