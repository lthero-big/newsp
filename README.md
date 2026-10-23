# newsp

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lthero-big/newsp)

个人用的每日 AI 新闻站：每天早上一期完整日报，15:00 / 20:00 各追加一次增量。规则打分、去重和配额都是确定性的（不用 AI）；
AI 只做一件事：用你自己的模型 Key 给卡片写中文标题和摘要（不配置就显示原标题）。

站点跑在 **Cloudflare Workers（静态资源）+ D1**：静态页面由 `scripts/build.mjs` 生成到 `dist/`，打分 / 收藏 / 垃圾箱 / 偏好学习 /
只读 MCP 等接口由同一个 Worker（`src/worker.js`）+ D1 提供。出刊可以跑在 **GitHub Actions**，也可以跑在**你自己的机器**（cron / Docker / self-hosted runner）。

> 从 news-daily 派生的干净版本：不带历史、数据和密钥，也不依赖任何特定的 bot 或代理服务。

## 功能

- 模块：模型新闻 / 开源项目发现 / 社区新闻；标签：AI / LLM / 图片视频音频 / Agent
- 来源：Hacker News、Reddit、RSS（官方博客、GitHub releases）、GitHub 新仓库、HF trending、OSS Insight、Arena 榜，
  可选 X（通过你自己部署的 RSSHub）和任意 RSSHub 路由
- 主人功能（口令解锁）：1–5 星、收藏、垃圾箱、多推 / 少推（偏好学习会影响下一期排序）、信息源开关和权重、主题、
  只读 MCP（`/mcp`，令牌在 `/mcp-admin` 生成）、可选的「深挖这条 / 自由指令」webhook
- 每周外观固定在 `editions/` 和 `data/themes/`（不再自动重做）

## 快速开始（本地预览）

```bash
npm ci
python3 -m pip install -r requirements.txt   # 可选依赖
npm test
npm run build            # data/ 里还没有日报时，用 examples/data 的示例日报生成 dist/
cp .dev.vars.example .dev.vars    # 本地主人口令（不要提交 .dev.vars）
npm run dev              # 构建 + 本地 D1 迁移 + wrangler dev（站点 + 接口 + 本地 D1）
```

跑一期（只在本地生成，不发布）：

```bash
cp deploy/env.example ~/.config/newsp/env && chmod 600 ~/.config/newsp/env   # 填好 LLM 等配置
bash scripts/run-edition.sh am --tests none
```

## 部署

### 1. Cloudflare（Workers + D1）

#### 一键部署（推荐）

点上面的 **Deploy to Cloudflare** 按钮（仓库必须是 Public）：

1. 登录 Cloudflare，授权 GitHub；Cloudflare 会把本仓库复制到你的 GitHub 账号下，并把它连到一个新 Worker（Workers Builds）。
2. 在设置页确认 Worker 名（默认 `newsp`）和 D1 数据库名（默认 `newsp-state`，自动创建），填 `RATINGS_TOKEN`（主人口令，
   自己设一个长随机串）。构建命令 `npm run build`、部署命令 `npm run deploy` 会自动带出来，保持不变即可。
3. 点部署。部署命令先 `wrangler deploy`（上线站点 + 接口、建好并绑定 D1），再 `wrangler d1 migrations apply DB --remote`
   （自动执行 `migrations/`，以后新增的迁移每次部署也会自动补上）。
4. 完成后站点在 `https://newsp.<你的子域>.workers.dev`；要用自己的域名，在 Worker → Settings → Domains & Routes 里加，
   再把它填到 `NEWS_SITE`。

之后每次 `main` 有新提交（包括出刊提交），Cloudflare 都会自动重新构建、部署。

#### 自己 fork 后手动连接

1. fork 本仓库。
2. Cloudflare 控制台 → Workers & Pages → 创建 → **Workers** → 导入 Git 仓库，选你的 fork；构建命令 `npm run build`，
   部署命令 `npm run deploy`。
3. 部署完成后，在 Worker → Settings → Variables and Secrets 加 secret `RATINGS_TOKEN`。

`wrangler.toml` 里没有任何账号相关的 id：D1 由 `wrangler deploy` 自动创建并按名字关联，不用改文件。

#### 命令行

需要一个有 **Workers 脚本编辑** 和 **D1 编辑** 权限的 API Token：

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… RATINGS_TOKEN=<自己设一个长口令> bash scripts/setup-cloudflare.sh newsp
```

脚本会构建 `dist/`、执行 `npm run deploy`（建 Worker 和 D1、执行迁移），再把 `RATINGS_TOKEN` 存成 Worker secret。

#### 出刊后怎么上线（`NEWS_DEPLOY`）

- **`git`（默认）**：Worker 已连接 GitHub 仓库（上面两种网页方式都是）。出刊脚本推送 `main`，Cloudflare 自己构建部署；
  脚本等 `$NEWS_SITE/build.txt` 出现新提交。这种方式 Actions / 服务器上都**不需要** Cloudflare token。
- **`direct`**：不连仓库，出刊后在本机 / Actions 里执行 `npm run deploy`（需要 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`）。
- **`none`**：只提交推送，不部署。

预览分支（`run-edition.sh --preview <分支>`）：在 Worker → Settings → Builds 打开「非生产分支构建」，并设置
`NEWSP_WORKERS_SUBDOMAIN`（你的 `<子域>.workers.dev` 前缀），脚本会等 `https://<分支>-newsp.<子域>.workers.dev`。

### 2a. GitHub Actions 出刊

`.github/workflows/edition.yml`：北京时间 08:30（完整）、15:00、20:00（增量），也能手动触发（可选只出预览分支）。
在仓库 **Settings → Secrets and variables → Actions** 里配置：

| 类型 | 名称 | 说明 |
|---|---|---|
| variable | `NEWSP_ENABLED` | 设为 `true` 才会运行 |
| variable | `NEWS_SITE` | 站点地址，如 `https://news.example.com` |
| variable | `NEWS_DEPLOY` | `git`（默认）/ `direct` / `none` |
| variable | `NEWSP_WORKER` / `NEWSP_WORKERS_SUBDOMAIN` | 可选，Worker 名（默认 `newsp`）和 workers.dev 子域，只用于等预览分支 |
| variable | `NEWSP_RUNS_ON` | 可选，JSON：`"ubuntu-latest"`（默认）或 `["self-hosted","linux"]` |
| secret | `RATINGS_TOKEN` | 主人口令，和 Worker secret 同值（读取反馈、上传信息源状态） |
| secret | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | `NEWS_DEPLOY=direct` 时需要 |
| variable + secret | `NEWS_LLM_PROVIDER` / `NEWS_LLM_BASE_URL` / `NEWS_LLM_MODEL` + `NEWS_LLM_API_KEY` | 见下面「模型」 |
| variable + secret | `NEWS_LLM_FALLBACK_*` | 可选的备用模型 |
| variable + secret | `RSSHUB_BASE` + `RSSHUB_ACCESS_KEY` | 可选，X 和 RSSHub 路由 |
| secret | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `NOTIFY_WEBHOOK_URL` | 可选，推送 |

跨次运行的状态（`var/`：已见条目、早间抓取结果、媒体缓存）用 `actions/cache` 保存；日报数据 `data/` 由脚本提交回 `main`。

注意：Reddit 对机房 IP（包括 GitHub 托管的 runner）经常返回 429，Reddit 卡片会变少。介意的话用 self-hosted runner
（`NEWSP_RUNS_ON`）或下面的自托管方式。

### 2b. 自托管（cron / Docker）

```bash
cp deploy/env.example ~/.config/newsp/env && chmod 600 ~/.config/newsp/env
bash scripts/selfhost.sh am                # 一次完整出刊：拉代码 → 出刊 → 发布 → 推送
crontab deploy/crontab.example             # 改好路径后安装定时
# 或者 Docker
docker build -t newsp . && docker run --rm -v "$PWD:/app" -v "$HOME/.config/newsp:/root/.config/newsp:ro" -v "$HOME/.ssh:/root/.ssh:ro" newsp am
```

checkout 需要能 `git push` 到你的仓库（SSH deploy key，或在 remote URL 里带 token）。不要让自托管和 Actions 同时对同一个仓库出刊。

## 模型（中文文案）

按服务商预设选，或者填任意 OpenAI 兼容地址：

| 变量 | 说明 |
|---|---|
| `NEWS_LLM_PROVIDER` | `openai` `anthropic` `gemini` `xai` `mistral` `groq` `openrouter` `deepseek` `qwen` `glm` `kimi` `doubao` `siliconflow` `ollama` `custom` |
| `NEWS_LLM_BASE_URL` | 可选，覆盖预设地址（代理 / 网关）；`custom` 必填 |
| `NEWS_LLM_MODEL` | 可选，预设有默认模型；`custom` / `doubao` 必填 |
| `NEWS_LLM_API_KEY` | Key（`ollama` 可留空） |
| `NEWS_LLM_FALLBACK_*` | 同上，主用失败（429 / 5xx / 超时）时使用 |
| `NEWS_LLM` | `key`（默认）/ `off`（不写中文，显示原标题） |

Key 只在运行环境里；站点的「模型」页只显示预设名和模型名。提示词在 `config/llm/prompt.md`。

## X 与 RSSHub

设置 `RSSHUB_BASE`（如 `https://rsshub.example.com`）和 `RSSHUB_ACCESS_KEY` 后：X 账号时间线 + 关键词搜索会进入日报
（`scripts/collect/x_standby.py`），信息源页里添加的 RSSHub 路由也会被抓取。RSSHub 的 Twitter 路由需要在 RSSHub 那边配置
`TWITTER_AUTH_TOKEN`。不设置就没有 X 卡片，其他来源不受影响。

## 「深挖这条 / 自由指令」webhook（可选）

在 Worker secrets 里设置 `AGENT_WEBHOOK_URL`（https）和可选的 `AGENT_WEBHOOK_KEY`、`AGENT_WEBHOOK_AUTH`（`bearer` / `header` / `both`），
卡片菜单会出现这两个按钮，点击后把卡片 JSON POST 到这个地址（每天最多 20 次）。不设置就不显示。

## 目录

- `scripts/run-edition.sh` 一期的完整流程；`scripts/daily.sh` 抓取 → 打分 → 补全 → 校验 → 构建；`scripts/publish.sh` 提交 + 部署
- `scripts/collect/` 抓取插件、规则打分（`generate.py`）、偏好学习（`learning.py`）、X / RSSHub
- `scripts/llm.py` 中文文案；`scripts/titles.py` 导入 / 导出
- `scripts/build.mjs` 静态站；`site/` 前端；`src/worker.js` Worker 入口（路由到 `functions/` 里的接口，其余交给 `dist/` 静态资源）；`migrations/` D1
- `config/` 来源、标签、提示词；`themes/` `editions/` `data/themes/` 外观
- `examples/data/` 示例日报（`data/` 为空时用于构建和测试）

## 许可

MIT，见 [LICENSE](LICENSE)。
