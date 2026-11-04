<img src="icon.svg" width="72" align="right" alt="Coding Plan balance gauge">

# dsh-coding-plan-balance

把 **Coding Plan 余额**做成 DSH Web 界面会话标题栏右侧的一枚常驻胶囊：本计费周期的已用 / 限额（USD）与百分比、**auto 模型**独立的月额度，以及滚动 5 小时窗口的用量；悬停展开时还能看到**高阶模型**的月额度与今日用量。

凭据复用你 profile 里 `ctrip` 模型 provider 的同一条 API Key；密钥只留在 Host 进程，页面只拿到额度数字。

```
◔ auto $3.05/$15
```

[中文](#中文) · [English](#english) · [MIT](LICENSE)

---

## 中文

### 特性

- **常驻会话标题栏**：注册进 `conversation.session.header.utilities`（右侧 utility 行，order 10），与 DSH 自带的 open-in-app、日程、导出等按钮并排；不占用输入框下方的垂直空间，也不需要为了看全它而拉大窗口。
- **一眼看到最要紧的一项**：标题栏只放一段短文本——套餐有 auto 月额度时显示 `auto 已用/限额`（`auto(free)` 模型实际在烧的就是这一桶），否则显示周期 `已用/限额`；其余数字都在悬停里。
- **悬停看全套**：套餐状态、周期已用/限额/百分比/剩余、auto 与高阶模型的月额度（含"已用尽"提示）、今日用量与告警阈值、重置时间、5h 窗口结束时间、本次读取时间。
- **点击刷新**（强制取最新），平时按 Host 下发的间隔（默认 60s）自动轮询；轮询走 Host 的复用窗口，多个会话同时看也只多打一次上游请求。
- **失败不消失**：未配置 Key、网络不通、额度被阻断时，胶囊留在原位并显示原因，数字改用主题的警告/错误色。
- **窄窗口自动收缩**：标题行是 inline-size 容器，宽度不足 560px 时只留仪表图标（悬停仍有完整明细），不挤占标题和右侧按钮。
- **同样的能力给 agent**：注册 `coding_plan_balance` 工具，可以直接问"还剩多少额度"。
- **主题与语言**：只用 `--dsw-alias-*` 主题 token（自动跟随明/暗），文案走 Client locale（中 / 英）。

### 安装

任选一种（都是 DSH 自带的插件安装路径）：

1. **Web GUI**：设置 → 插件 → 添加插件，填 `https://github.com/zq0929/dsh-coding-plan-balance`
2. **命令行**：`dsh plugin add https://github.com/zq0929/dsh-coding-plan-balance`
3. **本地开发**：克隆到本地后，在"添加插件"里填目录绝对路径，装完直接改源码即可（`index.js` 改动跟随 Loader 重组，`client.js` 改动跟随 Client 模块图）。

安装后需要**刷新页面**让浏览器侧模块生效。

### 凭据

插件不新增任何密钥配置，默认复用 profile 里 `ctrip` provider 用的那条 Key：

1. `config.apiKey`（显式配置，优先级最高）；
2. `ctx.credentials.resolve(config.apiKeyEnv)` —— 覆盖进程环境变量、provider 管理的凭据库、`.env`，默认名 `CTRIP_API_KEY`；
3. `process.env[config.apiKeyEnv]`。

如果你的 provider 用的是别的变量名，把 `apiKeyEnv` 改成那个名字即可。要求该 token 已绑定生效套餐。

### 配置

在你自己 profile 的 `cordis.patch.yml` 里按行 id 覆盖（profile 层在 bundle 层之后应用）：

```yaml
- id: coding-plan-balance
  config:
    apiKeyEnv: MY_CTRIP_KEY
    refreshSeconds: 120
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `baseUrl` | `https://ada-cli-go.ctripcorp.com` | Coding Plan API 主域名 |
| `fallbackBaseUrl` | `http://ada-cli-golang.ctripcorp.com` | 主域名不可达时回退；留空关闭回退 |
| `apiKeyEnv` | `CTRIP_API_KEY` | 凭据名 |
| `apiKey` | 空 | 显式密钥，优先于 `apiKeyEnv` |
| `refreshSeconds` | `60` | 页面轮询间隔，小于 20 按 20 处理 |
| `cacheSeconds` | `10` | Host 端快照复用窗口：不带 `refresh` 的读取在此窗口内复用同一份快照；并发读取一律合并成一次上游请求 |
| `timeoutMs` | `8000` | 单次上游请求超时 |
| `routePath` | `/api/coding-plan.balance` | 页面读取额度用的 Host 路由（必须以 `/api/` 开头） |
| `tool` | `true` | 是否注册 `coding_plan_balance` 工具 |

### 工作原理

- **Host 半**（[index.js](index.js)）：解析凭据 → 调 `/api/coding-plan/quota/me`、`/api/coding-plan/5h-usage`、`/api/user/api-tokens/userinfo`（`quota/me` 必需，另两个尽力而为）→ 归一化成一个快照 → 通过 `ctx.connection.fetch.register()` 挂在 `/api/coding-plan.balance`。鉴权、Host/Origin 校验、浏览器会话 cookie 都由 Connection 统一处理，未携带会话的请求得到 401。
- **auto / 高阶 / 今日额度来自 `quota/me`**：该接口除了文档写的周期字段，还会带 `autoUsedUsd`/`autoLimitUsd`/`autoPlanExhausted`、`advancedModelUsedUsd`/`advancedModelLimitUsd`、`todayUsedUsd`/`todayPercent`/`todayAlertPct` 以及一份 5h 数值副本，插件直接投影这些字段，不额外打接口。
- **5h 窗口**：`/api/coding-plan/5h-usage` 只用来取窗口起止时间与 `source`；它不可用时回退到 `quota/me` 里的 5h 副本，胶囊不会因此变空。
- **Client 半**（[client.js](client.js)）：用 `window.__ModuleLoader__` 注册懒工厂，通过 `ctx.slots.inject('conversation.session.header.utilities')` 挂一枚胶囊，正文压成一段短文本（有 auto 桶时 `auto $已用/$限额`，否则 `$已用/$限额`），完整明细放在悬停提示里，以文档相对路径拉取 `api/coding-plan.balance`，按 `refreshSeconds` 轮询，点击立即 `?refresh=1`。
- **一份实现两个调用方**：UI 点击和 agent 工具走同一条读取路径，工具结果是同一份快照，不存在两套逻辑。

### 已知限制

- 只读个人额度：团队套餐详情、团队 AI 代码统计这两类接口需要更大权限范围，本插件不调用。
- auto / 高阶模型月额度、今日用量这几个字段**不在公开发布的接口文档里**（是 `quota/me` 返回的额外字段），上游随时可能改名或去掉。插件按"字段缺失即不显示"处理：`autoLimitEnabled`/`autoUsedUsd` 都没有时胶囊不出现 auto 段，工具则明确说明"没有独立限额"。
- 5 小时窗口在 `source: none`（还没有产生费用、没有活动窗口）时，接口返回的窗口时间只是兜底展示值，插件因此不显示"窗口结束"。
- 需要能访问 `*.ctripcorp.com`（内网或代理）。
- 少数接口字段语义依赖上游：`limit_usd` 为 0 表示未配置限额，此时显示"不限"。
- 本仓库只做静态校验（语法、清单、id 一致性、语言文件、图标），没有浏览器视觉回归。

### 开发

```sh
node --check index.js
node --check client.js
node scripts/check.mjs
```

仓库自检脚本会核对：包名、`dsh.bundle.patch`、`exports`/`files` 覆盖的文件、`client.js` 的模块 id 与包名一致、`cordis.patch.yml` 行名与包名一致、中英语言文件的 `meta.title`/`meta.description`、图标是 `<svg>` 且在 256 KiB 以内。

---

## English

A persistent **Coding Plan quota chip** in the DSH Web session header: it shows the billing cycle's used/limit in USD with its percentage, the **auto model's** separate monthly bucket, and the rolling 5-hour window usage; hover adds the **high-cost-model** monthly bucket and today's spend.

```
◔ auto $3.05/$15
```

- **Where it renders**: one entry in `conversation.session.header.utilities`, the right-aligned utility row of the session header, beside the shipped open-in-app / schedule / export actions; it adds no height under the composer, using only `--dsw-alias-*` theme tokens and Client locale dictionaries (zh/en).
- **What the chip says**: one short run — the auto-model bucket (`auto $3.05/$15`) when the plan has one, since that is what an `auto(free)` model actually spends, otherwise the cycle bucket (`$0.17/$50`); everything else lives in the tooltip.
- **Narrow rows**: the title row is an inline-size container, so under 560px the chip collapses to its gauge icon (tooltip intact) instead of squeezing the title or the shipped actions.
- **Interaction**: hover for the full reading (plan status, cycle used/limit/percent/remaining, the auto and high-cost monthly buckets including an exhausted flag, today's spend with its alert threshold, reset time, 5-hour window end, last read time); click to refresh immediately, which forces a fresh read; otherwise it polls on the interval the Host reports (60s by default) through the Host's reuse window, so several sessions watching at once cost one upstream request.
- **Credential**: the same key your `ctrip` model provider uses — `config.apiKey`, then `ctx.credentials.resolve(apiKeyEnv)` (default `CTRIP_API_KEY`), then `process.env`. The key never reaches the page; only quota numbers do.
- **Also an agent tool**: `coding_plan_balance` returns the same snapshot, so the UI action and the tool share one implementation.
- **Host side**: the plugin calls `/api/coding-plan/quota/me`, `/api/coding-plan/5h-usage`, and `/api/user/api-tokens/userinfo`, normalizes one snapshot, and serves it on `/api/coding-plan.balance` through `ctx.connection.fetch.register()`, which owns browser-session authentication, Host/Origin checks, and the 401 for cookie-less requests.
- **Where the extra buckets come from**: `quota/me` also returns `autoUsedUsd`/`autoLimitUsd`/`autoPlanExhausted`, `advancedModelUsedUsd`/`advancedModelLimitUsd`, `todayUsedUsd`/`todayPercent`/`todayAlertPct`, and a copy of the 5-hour numbers, so no additional request is needed. `/api/coding-plan/5h-usage` only supplies the live window bounds and `source`; when it fails the chip falls back to that copy.

### Install

```sh
dsh plugin add https://github.com/zq0929/dsh-coding-plan-balance
```

Or use **Settings → Plugins → Add plugin** in the Web UI and paste the same Git URL (an absolute local path works too for development). Refresh the page afterwards.

### Configuration

Override the row by id in your profile's `cordis.patch.yml`:

```yaml
- id: coding-plan-balance
  config:
    apiKeyEnv: MY_CTRIP_KEY
    refreshSeconds: 120
```

| Field | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `https://ada-cli-go.ctripcorp.com` | Primary Coding Plan API origin |
| `fallbackBaseUrl` | `http://ada-cli-golang.ctripcorp.com` | Tried once when the primary is unreachable; empty disables it |
| `apiKeyEnv` | `CTRIP_API_KEY` | Credential name |
| `apiKey` | empty | Explicit key, takes priority over `apiKeyEnv` |
| `refreshSeconds` | `60` | Page poll interval (minimum 20) |
| `cacheSeconds` | `10` | Host-side reuse window: reads without `refresh` share one snapshot inside it, and concurrent reads always collapse into one upstream request |
| `timeoutMs` | `8000` | Upstream request timeout |
| `routePath` | `/api/coding-plan.balance` | Host route the page reads (must start with `/api/`) |
| `tool` | `true` | Register the `coding_plan_balance` tool |

### Limitations

Read-only personal quota. The team plan and team AI-code-statistics endpoints are out of scope. The auto/high-cost monthly buckets and today's spend are **extra fields `quota/me` returns that the published API document does not describe**, so upstream may rename or drop them; the plugin degrades to omitting the auto segment and reporting "no separate limit configured" in the tool. With `5h` `source: none` the API's window times are display fallbacks, so no window end is shown. The plugin needs network access to `*.ctripcorp.com`. CI checks syntax, manifest, id consistency, locales, and the icon — there is no browser visual regression.

## License

[MIT](LICENSE) © 2026 zq0929
