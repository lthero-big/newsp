# 部署

站点是一个 Cloudflare Worker：静态页面在 `dist/`（由 `npm run build` 生成），接口由同一个 Worker（`src/worker.js`）+ D1 提供。`wrangler.toml` 里没有任何账号相关的 id，D1 数据库 `newsp-state` 在第一次部署时自动创建并按名字关联，不用改文件。

## 1. 一键部署（推荐）

点仓库首页的按钮：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lthero-big/newsp)

1. 登录 Cloudflare，授权 GitHub。Cloudflare 会把本仓库复制到你的 GitHub 账号下，并把它连到一个新 Worker（Workers Builds）。
2. 在设置页确认：
   - Worker 名：默认 `newsp`
   - D1 数据库：默认 `newsp-state`，自动创建
   - `RATINGS_TOKEN`：主人口令，自己设一个长随机串（如 `openssl rand -hex 24`），之后 Actions 出刊也要填同一个值
   - 构建命令 `npm run build`、部署命令 `npm run deploy`：自动带出，保持不变
3. 点部署。部署命令先 `wrangler deploy`（上线站点和接口、创建并绑定 D1），再 `wrangler d1 migrations apply DB --remote`（执行 `migrations/`；以后新增的迁移每次部署都会自动补上）。
4. 完成后站点在 `https://newsp.<你的子域>.workers.dev`。还没出过刊时显示的是 `examples/data/` 里的示例日报。

之后你的仓库 `main` 每有新提交（包括出刊提交），Cloudflare 都会自动重新构建和部署。下一步：[配置出刊](Editions)。

## 2. 自己 fork 后手动连接

1. fork 本仓库。
2. Cloudflare 控制台 → Workers & Pages → 创建 → **Workers** → 导入 Git 仓库，选你的 fork；构建命令 `npm run build`，部署命令 `npm run deploy`。
3. 部署完成后，在 Worker → Settings → Variables and Secrets 添加 secret `RATINGS_TOKEN`。

## 3. 命令行部署

需要一个有 **Workers 脚本编辑** 和 **D1 编辑** 权限的 Cloudflare API Token：

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… RATINGS_TOKEN=<自己设一个长口令> bash scripts/setup-cloudflare.sh newsp
```

`scripts/setup-cloudflare.sh [worker 名]` 可以重复运行：

1. 传了不同的 Worker 名时，改写 `wrangler.toml` 里的 Worker 名和 D1 名（`<worker>-state`）——记得提交这个改动；
2. 构建 `dist/`，执行 `npm run deploy`（创建 Worker、自动创建 D1、执行迁移）；
3. 把 `RATINGS_TOKEN` 存成 Worker secret；环境里有 `AGENT_WEBHOOK_URL` / `AGENT_WEBHOOK_KEY` / `AGENT_WEBHOOK_AUTH` 时也一并存好。

命令行部署的 Worker 没有连接 GitHub。出刊时要么之后在 Worker → Settings → Builds 连上仓库（`NEWS_DEPLOY=git`），要么让出刊脚本直接部署（`NEWS_DEPLOY=direct`），见 [出刊](Editions#出刊后怎么上线news_deploy)。

## 自定义域名

在 Worker → Settings → Domains & Routes 添加你的域名，再把它填到出刊配置的 `NEWS_SITE`（如 `https://news.example.com`）。`NEWS_DEPLOY=git` 时出刊脚本会轮询 `$NEWS_SITE/build.txt`，等它显示刚推送的提交。

## 预览分支

`run-edition.sh --preview edition/<名字>`（或 Actions 手动运行选 `preview`）只把这一期推到 `edition/*` 分支，不碰 `main`。要看到预览站：

1. 在 Worker → Settings → Builds 打开「非生产分支构建」（Builds for non-production branches）；
2. 设置 `NEWSP_WORKERS_SUBDOMAIN`（你的 `<子域>.workers.dev` 前缀），Worker 名不是 `newsp` 时再设 `NEWSP_WORKER`。

脚本会等 `https://<分支别名>-newsp.<子域>.workers.dev/build.txt` 出现这次提交（最多 10 分钟）。

## 上线前检查

- `RATINGS_TOKEN` 已设置（否则主人功能接口返回 503 `not configured`）。
- 打开 `/build.txt` 能看到当前部署的提交。
- 全站带 `noindex`（`robots.txt`、`_headers` 和 Worker 都会加），不会被搜索引擎收录；但页面本身是公开可访问的，主人数据只在口令 / MCP 令牌之后。
