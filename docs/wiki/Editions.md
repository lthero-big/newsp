# 出刊

一期日报由 `scripts/run-edition.sh` 生成并发布。可以跑在 **GitHub Actions**，也可以跑在**你自己的机器**（cron / Docker / self-hosted runner）。两者用同一套环境变量（见 [配置](Configuration)）。**不要让两边同时对同一个仓库出刊。**

| 时间（北京时间） | 运行 | 内容 |
| --- | --- | --- |
| 08:30 | `am` | 完整日报 |
| 15:00 | `pm`（`NEWS_RUN=15:00`） | 增量：保留早间条目，只追加新条目 |
| 20:00 | `pm`（`NEWS_RUN=20:00`） | 增量 |

## GitHub Actions

工作流 `.github/workflows/edition.yml` 按上面三个时间定时运行（Actions 的定时任务可能晚 5–30 分钟），也可以在 Actions 页手动运行：选 `am` / `pm`、`pm` 的时刻，以及 `publish`（上线）或 `preview`（只推 `edition/manual` 分支）。

在仓库 **Settings → Secrets and variables → Actions** 里配置：

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| variable | `NEWSP_ENABLED` | 设为 `true` 才会运行 |
| variable | `NEWS_SITE` | 站点地址，如 `https://news.example.com` |
| variable | `NEWS_DEPLOY` | `git`（默认）/ `direct` / `none` |
| variable | `NEWSP_WORKER` / `NEWSP_WORKERS_SUBDOMAIN` | 可选，Worker 名（默认 `newsp`）和 workers.dev 子域，只用于等预览分支 |
| variable | `NEWSP_RUNS_ON` | 可选，JSON：`"ubuntu-latest"`（默认）或 `["self-hosted","linux"]` |
| secret | `RATINGS_TOKEN` | 主人口令，和 Worker secret 同值（读取反馈、上传信息源状态） |
| secret | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | `NEWS_DEPLOY=direct` 时需要 |
| variable | `NEWS_LLM` | 可选，`key`（默认）/ `off` |
| variable + secret | `NEWS_LLM_PROVIDER` / `NEWS_LLM_BASE_URL` / `NEWS_LLM_MODEL` + `NEWS_LLM_API_KEY` | 模型，见 [配置](Configuration#模型中文文案) |
| variable + secret | `NEWS_LLM_FALLBACK_PROVIDER` / `_BASE_URL` / `_MODEL` + `NEWS_LLM_FALLBACK_API_KEY` | 可选的备用模型 |
| variable + secret | `RSSHUB_BASE` + `RSSHUB_ACCESS_KEY` | 可选，X 和 RSSHub 路由 |
| secret | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `NOTIFY_WEBHOOK_URL` | 可选，推送 |

说明：

- 跨次运行的状态（`var/`：已见条目、早间抓取结果、媒体缓存、日志）用 `actions/cache` 保存；日报数据 `data/` 由脚本提交回 `main`（工作流有 `contents: write` 权限，提交者是 `newsp-bot`）。
- 工作流会装 `playwright-core` 并用 runner 上的 Chrome 跑快检（手机布局 + 不变量），失败不发布。
- 工作流只传上表里的推送变量；Bark / Server 酱只在自托管时可用（或自己改工作流）。
- Reddit 对机房 IP（包括 GitHub 托管的 runner）经常返回 429，Reddit 卡片会变少。介意的话用 self-hosted runner（`NEWSP_RUNS_ON`）或自托管。

## 自托管（cron / Docker）

```bash
mkdir -p ~/.config/newsp && cp deploy/env.example ~/.config/newsp/env && chmod 600 ~/.config/newsp/env   # 填好配置
bash scripts/selfhost.sh am                 # 一次完整出刊：拉代码 → 出刊 → 发布 → 推送
crontab deploy/crontab.example              # 改好路径后安装定时（CRON_TZ=Asia/Shanghai）
```

`scripts/selfhost.sh am|pm [run-edition 参数]`：用文件锁防止重复运行，`git pull --rebase`，缺 `node_modules` 时 `npm ci`，然后 `run-edition.sh <am|pm> --publish --tests ${NEWS_TESTS:-none}`，日志写到 `var/logs/selfhost-<日期>-<am|pm>.log`，成功或失败都会推送通知。配置文件位置可以用 `NEWSP_ENV` 改。

这个 checkout 需要能 `git push` 到你的仓库（SSH deploy key，或在 remote URL 里带 token）。

### Docker

镜像只是运行环境（Node 22 + Python 3 + git），仓库挂载到 `/app`，数据提交落在你的 checkout 里：

```bash
docker build -t newsp .
docker run --rm -v "$PWD:/app" -v "$HOME/.config/newsp:/root/.config/newsp:ro" -v "$HOME/.ssh:/root/.ssh:ro" newsp am
```

入口是 `scripts/selfhost.sh`，参数 `am` / `pm` 同上。

## `run-edition.sh` 参数

```text
scripts/run-edition.sh am|pm [--publish | --preview edition/<x>] [--replay <run-dir>] [--tests quick|suite|full|none]
```

| 参数 | 作用 |
| --- | --- |
| `am` / `pm` | 完整日报 / 增量（`pm` 按 `NEWS_RUN` 或当前时间判断 15:00 还是 20:00） |
| `--publish` | 正式发布（`scripts/publish.sh`） |
| `--preview edition/<x>` | 只提交推送到 `edition/*` 分支，不碰 `main`；不能在 `main` 的 checkout 上用 |
| `--replay <run-dir>` | 用保存的一次抓取结果（`raw.json` + `stats.json`）重新打分，不再抓取 |
| `--tests` | `quick`（默认，2 套主题 × 390/1440）· `suite`（所有主题）· `full`（suite + editions）· `none`；`NEWS_FULL_TESTS=1` 把 quick 变成 suite |

不带 `--publish` / `--preview` 时只在本地生成 `dist/`。日期默认是北京时间今天，可用 `NEWS_DATE=YYYY-MM-DD` 指定。

## 出刊后怎么上线（`NEWS_DEPLOY`）

| 值 | 做法 | 需要 |
| --- | --- | --- |
| `git`（默认） | Worker 已连接 GitHub 仓库（一键部署和手动连接都是）。脚本推送 `main`，Cloudflare 自己构建部署；脚本等 `$NEWS_SITE/build.txt` 出现新提交 | `NEWS_SITE`；不需要 Cloudflare token |
| `direct` | 不连仓库，出刊后在本机 / Actions 执行 `npm run deploy` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` |
| `none` | 只提交推送，不部署 | — |

## 推送通知

`scripts/notify/notify.sh "<标题>" <正文文件>` 推到所有已配置的渠道（一个都没配就跳过，永远不会让出刊失败）：

| 渠道 | 变量 |
| --- | --- |
| Telegram | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` |
| 通用 Webhook | `NOTIFY_WEBHOOK_URL`（POST JSON `{subject, text}`），可选 `NOTIFY_WEBHOOK_KEY`（`Authorization: Bearer`） |
| Bark | `BARK_KEY`，可选 `BARK_SERVER`（默认 `https://api.day.app`） |
| Server 酱 | `SERVERCHAN_KEY` |

更多写法见 `scripts/notify/notify.example.sh`。
