# 常见问题

**不配大模型能用吗？**
能。打分、去重、配额本来就不用 AI；不配模型（或 `NEWS_LLM=off`）时卡片显示原标题。设置了 RSSHub 时，X 条目的相关性判断也会用到模型，可用 `NEWS_X_SCORE=0` 关掉。

**刚部署完，站点上是两天的示例日报？**
正常。`data/` 里还没有日报时，构建使用 `examples/data/` 的示例；第一期真实出刊后就换成你自己的日报。

**Deploy to Cloudflare 按钮报错 / 找不到仓库？**
按钮只能部署 Public 仓库。fork 成私有仓库的话，用 [手动连接](Deployment#2-自己-fork-后手动连接) 或 [命令行](Deployment#3-命令行部署)。

**主人功能接口返回 503 `not configured`？**
Worker 上没有 `RATINGS_TOKEN` secret，或者没有绑定 D1。在 Worker → Settings → Variables and Secrets 加上 `RATINGS_TOKEN`；D1 绑定由 `wrangler.toml` 声明，重新部署一次即可。

**输口令提示被锁定（429）？**
同一个 IP 连续输错 3 次会锁 15 分钟，等锁定结束再试。MCP 令牌的失败也有同样的锁。

**GitHub Actions 的出刊没有运行？**
先确认仓库变量 `NEWSP_ENABLED` 是 `true`。Actions 的定时任务经常晚 5–30 分钟；fork 的仓库默认禁用了 Actions，要在 Actions 页手动启用。

**出刊成功了，但站点没更新？**
`NEWS_DEPLOY=git` 时，脚本推送 `main` 后等 `$NEWS_SITE/build.txt` 出现新提交。如果一直没出现，到 Cloudflare 的 Worker → Deployments / Builds 看构建日志，确认 Worker 连接的是你的仓库和 `main` 分支、`NEWS_SITE` 填的是这个 Worker 的地址。没连仓库的话改用 `NEWS_DEPLOY=direct`。

**Reddit 的卡片很少？**
Reddit 对机房 IP（包括 GitHub 托管的 runner）经常返回 429。用 self-hosted runner（`NEWSP_RUNS_ON`）或自托管出刊。

**没有 X 的卡片？**
需要你自己部署的 RSSHub：设置 `RSSHUB_BASE`（和 `RSSHUB_ACCESS_KEY`），并在 RSSHub 那边配置好 Twitter 路由的凭据。未设置时 X 会被跳过，其他来源不受影响。

**中文标题只写了一部分？**
模型调用失败时缺的卡片显示原标题，日志里会提示 `llm.py 没写全`。配一个备用模型（`NEWS_LLM_FALLBACK_*`）可以在主用 429 / 5xx / 超时时自动切换。

**可以同时用 Actions 和自己的机器出刊吗？**
不要。两边会同时往 `main` 提交同一天的数据。选一边；自托管可以只在 Actions 关闭时作为备用。

**本地 `npm test` 一堆失败？**
多半是 Node 版本不对：测试用 `node:sqlite`，需要 Node 22（见 `.nvmrc`）。

**站点会被搜索引擎收录吗？**
不会。`robots.txt` 禁止抓取，所有响应都带 `X-Robots-Tag: noindex, nofollow`。但页面是公开可访问的，只有主人数据（收藏、垃圾箱、偏好、信息源设置）在口令后面。
