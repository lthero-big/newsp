# newsp Wiki

newsp 是一个个人用的每日 AI 新闻站：每天早上一期完整日报，15:00 / 20:00 各追加一次增量。打分、去重、配额都是确定性规则；AI 只用你自己的模型 Key 写中文标题和摘要。站点跑在 Cloudflare Workers（静态资源）+ D1，出刊跑在 GitHub Actions 或你自己的机器。功能介绍和截图见 [仓库首页](https://github.com/lthero-big/newsp)。

## 目录

| 页面 | 内容 |
| --- | --- |
| [架构](Architecture) | 出刊流水线、Worker 和接口、D1 表、状态放在哪里 |
| [部署](Deployment) | Deploy to Cloudflare 一键部署、手动连接 fork、命令行部署、自定义域名、预览分支 |
| [出刊](Editions) | GitHub Actions 定时出刊、自托管（cron / Docker）、`run-edition.sh` 参数、推送通知 |
| [配置](Configuration) | 全部环境变量、模型预设、RSSHub / X、Worker secrets |
| [使用](Usage) | 主人解锁、点赞 / 少推 / 收藏 / 垃圾箱、订阅源、主题、MCP、webhook |
| [开发](Development) | 本地开发、测试、CI |
| [常见问题](FAQ) | 部署和出刊中常见的问题 |

## 最短路径

1. 点仓库首页的 **Deploy to Cloudflare**，填 `RATINGS_TOKEN`，部署（[部署](Deployment)）。
2. 在你的仓库里配好 Actions 的 secrets / variables，把 `NEWSP_ENABLED` 设为 `true`（[出刊](Editions)）。
3. 第二天早上 08:30（北京时间）之后打开站点；在站点上解锁主人功能（[使用](Usage)）。

> 本 Wiki 的源文件在仓库 [`docs/wiki/`](https://github.com/lthero-big/newsp/tree/main/docs/wiki)，用 `scripts/publish-wiki.sh` 同步到 GitHub Wiki；修改请改仓库里的文件。
