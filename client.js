/**
 * Browser half of the Coding Plan balance widget: one compact chip in the
 * Session header's utility row that polls the Host's own authenticated route
 * and shows the plan's USD usage.
 */

window.__ModuleLoader__.load({
  id: 'dsh-coding-plan-balance',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace the pill's registration seat binds to. */
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

    /** Integer percentage, defaulting to 0 for a value the API omitted. */
    function pct(value) {
      return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0
    }

    /** Local rendering of an ISO8601 instant. */
    function localTime(value) {
      if (typeof value !== 'string' || value === '') return '—'
      const at = new Date(value)
      return Number.isNaN(at.getTime()) ? value : at.toLocaleString()
    }

    /** Reading of a thrown value. */
    function describe(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /** A quarter-gauge mark; the artwork carries its own shape, not a theme token. */
    function GaugeIcon(props) {
      return h('svg', {
        viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: false,
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

    /** Compact USD amount: cents only when they carry information. */
    function amount(value) {
      const rounded = Math.round((typeof value === 'number' && Number.isFinite(value) ? value : 0) * 100) / 100
      return `$${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)}`
    }

    /** Compact limit, naming the unconfigured case. */
    function limitCompact(value, t) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? amount(value) : t('unlimited')
    }

    /**
     * Header chip showing the bucket that is actually being spent: the auto
     * model's monthly quota when the plan has one, otherwise the cycle quota.
     * It polls on the interval the Host reports and refetches on click; a
     * failed read stays visible instead of hiding the entry.
     */
    function BalanceChip(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => (DICT.en[key] !== undefined ? DICT.en[key] : key)
      const [state, setState] = React.useState({ phase: 'loading', value: null, error: '' })
      /** One read trigger: mounting and clicking ask for a fresh snapshot, the timer reuses the Host's window. */
      const [attempt, setAttempt] = React.useState({ seq: 0, force: true })
      const intervalRef = React.useRef(60)

      React.useEffect(() => {
        let cancelled = false
        const controller = new AbortController()
        setState((previous) => ({ ...previous, phase: 'loading' }))
        requestSnapshot(attempt.force, controller.signal)
          .then((value) => {
            if (cancelled) return
            const seconds = Number(value.refreshSeconds)
            intervalRef.current = Number.isFinite(seconds) && seconds >= 20 ? seconds : 60
            setState({
              phase: 'ready',
              value,
              error: value.ok === true ? '' : (typeof value.error === 'string' ? value.error : ''),
            })
          })
          .catch((error) => {
            if (cancelled) return
            setState({ phase: 'ready', value: null, error: describe(error) })
          })
        return () => {
          cancelled = true
          controller.abort()
        }
      }, [attempt])

      React.useEffect(() => {
        const id = window.setInterval(() => {
          setAttempt((previous) => ({ seq: previous.seq + 1, force: false }))
        }, Math.max(20, intervalRef.current) * 1000)
        return () => {
          window.clearInterval(id)
        }
      }, [attempt])

      const value = state.value
      const ok = value !== null && value.ok === true
      const autoExhausted = ok && value.autoExhausted === true
      const blocked = ok && (value.isBlocked === true || autoExhausted)
      const loading = state.phase === 'loading'
      const missingKey = !ok && value !== null && value.code === 'no-key'
      const showAuto = ok && (value.autoEnabled === true || value.autoUsedUsd > 0)
      const showAdvanced = ok && (value.advancedEnabled === true || value.advancedUsedUsd > 0)
      /** One short run for the header chip; the tooltip carries the detail. */
      let label

      if (ok) {
        label = showAuto
          ? `${t('auto')} ${amount(value.autoUsedUsd)}/${limitCompact(value.autoLimitUsd, t)}`
          : `${amount(value.usedUsd)}/${limitCompact(value.limitUsd, t)}`
        if (value.isBlocked === true) label = `${label} ${t('blocked')}`
        else if (autoExhausted) label = `${label} ${t('autoUsedUp')}`
      } else if (loading) {
        label = t('loading')
      } else {
        label = missingKey ? t('noKey') : t('error')
      }

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
      const title = detail.join('\n')

      const chip = h('button', {
        type: 'button',
        className: 'dshcp-pill',
        'data-state': loading ? 'loading' : ok ? (blocked ? 'blocked' : 'ready') : 'error',
        'data-coding-plan-balance': ok ? 'ready' : loading ? 'loading' : 'error',
        title,
        'aria-label': `${t('plan')}: ${title.replace(/\n/g, ' ')}`,
        onClick: () => {
          setAttempt((previous) => ({ seq: previous.seq + 1, force: true }))
        },
      },
      h(GaugeIcon, { className: loading ? 'dshcp-busy' : undefined }),
      h('span', { className: 'dshcp-label' }, label))

      return h(React.Fragment, null,
        h('style', { key: 'style' }, CSS),
        h('span', { className: 'dshcp-anchor' }, chip))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale !== undefined) {
          ctx.effect(() => locale.register(NS, 'zh', DICT.zh), 'coding-plan-balance: zh dictionary')
          ctx.effect(() => locale.register(NS, 'en', DICT.en), 'coding-plan-balance: en dictionary')
        }
        // The Session header's right-aligned utility row: always on screen,
        // and it costs no vertical space below the composer.
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'coding-plan-balance',
          order: 10,
          locale: NS,
        }, BalanceChip))
      },
    }
  },
})
