<img src="icon.svg" width="72" align="right" alt="Coding Plan balance gauge">

# dsh-coding-plan-balance

把 **Coding Plan 余额**做成 DSH Web 界面里输入框下方的一枚常驻胶囊：本计费周期的已用 / 限额（USD）、使用百分比，以及滚动 5 小时窗口的用量。

凭据复用你 profile 里 `ctrip` 模型 provider 的同一条 API Key；密钥只留在 Host 进程，页面只拿到额度数字。

```
◔ 50 美金 · $0.13 / $50.00 · 0% · 5h $0.00 / $50.00
```

[中文](#中文) · [English](#english) · [MIT](LICENSE)

---

## 中文

### 特性

- **常驻输入框下方**：注册进 `conversation.composer.dock`，与 DSH 自带的 activity / usage 两个胶囊并排，不占对话区域。
- **一眼看到三件事**：套餐名 · 周期已用/限额 · 使用百分比 · 5 小时窗口用量。
- **悬停看细节**：套餐状态、周期已用/限额/百分比、剩余额度、重置时间、5h 窗口结束时间、本次读取时间。
- **点击刷新**（强制取最新），平时按 Host 下发的间隔（默认 60s）自动轮询；轮询走 Host 的复用窗口，多个会话同时看也只多打一次上游请求。
- **失败不消失**：未配置 Key、网络不通、额度被阻断时，胶囊留在原位并显示原因，数字改用主题的警告/错误色。
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

- **Host 半**（[index.js](index.js)）：解析凭据 → 调 `/api/coding-plan/quota/me`、`/api/coding-plan/5h-usage`、`/api/user/api-tokens/userinfo`（周期配额必需，另两个尽力而为）→ 归一化成一个快照 → 通过 `ctx.connection.fetch.register()` 挂在 `/api/coding-plan.balance`。鉴权、Host/Origin 校验、浏览器会话 cookie 都由 Connection 统一处理，未携带会话的请求得到 401。
- **Client 半**（[client.js](client.js)）：用 `window.__ModuleLoader__` 注册懒工厂，通过 `ctx.slots.inject('conversation.composer.dock')` 挂一枚胶囊，以文档相对路径拉取 `api/coding-plan.balance`，按 `refreshSeconds` 轮询，点击立即 `?refresh=1`。
- **一份实现两个调用方**：UI 点击和 agent 工具走同一条读取路径，工具结果是同一份快照，不存在两套逻辑。

### 已知限制

- 只读个人额度：团队套餐详情、团队 AI 代码统计这两类接口需要更大权限范围，本插件不调用。
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

A persistent **Coding Plan quota pill** for the DSH Web composer dock: it shows the billing cycle's used/limit in USD, the usage percentage, and the rolling 5-hour window usage.

```
◔ 50 美金 · $0.13 / $50.00 · 0% · 5h $0.00 / $50.00
```

- **Where it renders**: one entry in `conversation.composer.dock`, beside the shipped activity/usage pills, using only `--dsw-alias-*` theme tokens and Client locale dictionaries (zh/en).
- **Interaction**: hover for the full reading (plan status, cycle used/limit/percent, remaining, reset time, 5-hour window end, last read time); click to refresh immediately, which forces a fresh read; otherwise it polls on the interval the Host reports (60s by default) through the Host's reuse window, so several sessions watching at once cost one upstream request.
- **Credential**: the same key your `ctrip` model provider uses — `config.apiKey`, then `ctx.credentials.resolve(apiKeyEnv)` (default `CTRIP_API_KEY`), then `process.env`. The key never reaches the page; only quota numbers do.
- **Also an agent tool**: `coding_plan_balance` returns the same snapshot, so the UI action and the tool share one implementation.
- **Host side**: the plugin calls `/api/coding-plan/quota/me`, `/api/coding-plan/5h-usage`, and `/api/user/api-tokens/userinfo`, normalizes one snapshot, and serves it on `/api/coding-plan.balance` through `ctx.connection.fetch.register()`, which owns browser-session authentication, Host/Origin checks, and the 401 for cookie-less requests.

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

Read-only personal quota. The team plan and team AI-code-statistics endpoints are out of scope. With `5h` `source: none` the API's window times are display fallbacks, so no window end is shown. The plugin needs network access to `*.ctripcorp.com`. CI checks syntax, manifest, id consistency, locales, and the icon — there is no browser visual regression.

## License

[MIT](LICENSE) © 2026 zq0929
