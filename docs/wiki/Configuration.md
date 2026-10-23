# 配置

newsp 有两处配置：

- **出刊环境**（抓取、模型、部署、推送）：自托管时写在 `~/.config/newsp/env`（从 [`deploy/env.example`](https://github.com/lthero-big/newsp/blob/main/deploy/env.example) 复制，`chmod 600`，可用 `NEWSP_ENV` 指定别的路径）；GitHub Actions 里是同名的 secrets / variables（见 [出刊](Editions#github-actions)）。
- **Worker secrets**（站点接口）：在 Cloudflare 的 Worker → Settings → Variables and Secrets 设置；本地开发写在 `.dev.vars`（从 `.dev.vars.example` 复制，不要提交）。

密钥只存在运行环境里，不会写进仓库或站点。

## Worker secrets

| 名称 | 说明 |
| --- | --- |
| `RATINGS_TOKEN` | **必填**，主人口令。网站上解锁点赞 / 收藏 / 垃圾箱 / 信息源 / MCP 管理时输入；出刊环境里也要填同一个值 |
| `AGENT_WEBHOOK_URL` | 可选，「深挖这条 / 自由指令」转发地址（必须 https）；不设就不显示这两个按钮 |
| `AGENT_WEBHOOK_KEY` | 可选，转发时带的密钥 |
| `AGENT_WEBHOOK_AUTH` | 可选，`bearer`（`Authorization: Bearer <key>`）/ `header`（`X-Webhook-Key: <key>`）/ `both`（默认） |

绑定 `DB`（D1）由 `wrangler.toml` 声明，部署时自动创建。

## 站点与部署

| 变量 | 说明 |
| --- | --- |
| `NEWS_SITE` | 站点地址，如 `https://news.example.com`；`NEWS_DEPLOY=git` 时用它的 `/build.txt` 确认上线 |
| `RATINGS_TOKEN` | 同 Worker secret；出刊时用它读取主人反馈（`scripts/sync-state.mjs`）、上传信息源采集状态 |
| `NEWS_DEPLOY` | `git`（默认）/ `direct` / `none`，见 [出刊](Editions#出刊后怎么上线news_deploy) |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | `NEWS_DEPLOY=direct` 和 `scripts/setup-cloudflare.sh` 需要 |
| `NEWSP_WORKER` | Worker 名，默认 `newsp` |
| `NEWSP_WORKERS_SUBDOMAIN` | 你的 `<子域>.workers.dev` 前缀，只用于等预览分支 |
| `PAGES_REPO` | 可选，一个 git remote；设置后发布时把 `dist/` 再推一份到这里做备份 |

## 模型（中文文案）

| 变量 | 说明 |
| --- | --- |
| `NEWS_LLM` | `key`（默认）/ `off`（不写中文，卡片显示原标题）。存在 `var/llm/DISABLED` 文件也等于 `off` |
| `NEWS_LLM_PROVIDER` | 服务商预设，见下表；留空也会显示原标题 |
| `NEWS_LLM_BASE_URL` | 可选，覆盖预设地址（代理 / 网关）；`custom` 必填 |
| `NEWS_LLM_MODEL` | 可选，预设有默认模型；`custom` / `doubao` 必填 |
| `NEWS_LLM_API_KEY` | Key（`ollama` 可留空） |
| `NEWS_LLM_FALLBACK_PROVIDER` / `_BASE_URL` / `_MODEL` / `_API_KEY` | 可选的备用模型，主用失败（429 / 5xx / 超时）时使用 |
| `NEWS_LLM_BATCH` / `NEWS_LLM_JOBS` | 每次请求的卡片数（默认 8）和并发数（默认 2） |

| 预设 | 服务商 | 默认模型 |
| --- | --- | --- |
| `openai` | OpenAI | `gpt-4.1-mini` |
| `anthropic` | Anthropic Claude | `claude-haiku-4-5` |
| `gemini` | Google Gemini | `gemini-2.5-flash` |
| `xai` | xAI Grok | `grok-4-fast` |
| `mistral` | Mistral | `mistral-small-latest` |
| `groq` | Groq | `llama-3.3-70b-versatile` |
| `openrouter` | OpenRouter | `deepseek/deepseek-chat` |
| `deepseek` | DeepSeek | `deepseek-chat` |
| `qwen` | 通义千问 | `qwen-plus` |
| `glm` | 智谱 GLM | `glm-4-flash` |
| `kimi` | Moonshot Kimi | `moonshot-v1-32k` |
| `doubao` | 豆包 | 需自己填 |
| `siliconflow` | SiliconFlow | `deepseek-ai/DeepSeek-V3` |
| `ollama` | Ollama（`http://localhost:11434/v1`） | `qwen3:8b` |
| `custom` | 任意 OpenAI 兼容地址 | 需自己填 |

提示词在 [`config/llm/prompt.md`](https://github.com/lthero-big/newsp/blob/main/config/llm/prompt.md)。站点的「模型」页（主人可见）只显示预设名和模型名，不显示 Key。

## X 与 RSSHub

| 变量 | 说明 |
| --- | --- |
| `RSSHUB_BASE` | 你自己部署的 RSSHub 地址（如 `https://rsshub.example.com`）；设置后默认开启 X |
| `RSSHUB_ACCESS_KEY` | RSSHub 的访问密钥 |
| `NEWS_X` | `rsshub`（设置了 `RSSHUB_BASE` 时的默认）/ `off` |
| `NEWS_X_SCORE` | 默认 `1`：X 条目规则过滤后再用模型判断一次相关性；`0` 关闭 |
| `NEWS_X_HOURS` | X 回看小时数，默认 `am` 26、`pm` 12 |
| `NEWS_X_ITEMS` | 指定一个现成的 X 条目文件，代替 RSSHub 抓取 |

设置后：X 账号时间线 + 关键词搜索进入日报（`scripts/collect/x_standby.py`），「订阅源」页里添加的 RSSHub 路由也会被抓取。RSSHub 的 Twitter 路由需要在 RSSHub 那边配置好 X 的登录凭据（见 [RSSHub 文档](https://docs.rsshub.app)）。不设置就没有 X 卡片，其他来源不受影响。

## 推送

`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` · `NOTIFY_WEBHOOK_URL`（+ `NOTIFY_WEBHOOK_KEY`）· `BARK_KEY`（+ `BARK_SERVER`）· `SERVERCHAN_KEY`，见 [出刊](Editions#推送通知)。

## 运行参数

| 变量 | 说明 |
| --- | --- |
| `NEWS_DATE` | 出刊日期，默认北京时间今天 |
| `NEWS_RUN` | `pm` 的时刻：`15:00` / `20:00`（默认按当前时间判断） |
| `NEWS_TESTS` | `selfhost.sh` 传给 `--tests` 的值，默认 `none` |
| `NEWS_FULL_TESTS` | `1` = 快检改成全部主题 |
| `NEWS_NO_MEDIA` | 设置后跳过卡片图片 / 链接补全（不联网抓媒体） |

## 信息源与标签

- [`config/collect-sources.json`](https://github.com/lthero-big/newsp/blob/main/config/collect-sources.json)：默认信息源（Hacker News 查询、Reddit 子版块、RSS、GitHub 搜索、HF、OSSInsight、RSSHub 路由、X 查询和账号）。上线后在站点「订阅源」页开关和调权重，存进 D1，不用改文件。
- [`config/tags.json`](https://github.com/lthero-big/newsp/blob/main/config/tags.json)：标签词表。
