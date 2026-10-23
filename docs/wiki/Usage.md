# 使用

站点对所有人只读开放（全站 `noindex`）。点赞、收藏、垃圾箱、订阅源、MCP 管理等是**主人功能**，要用 `RATINGS_TOKEN` 解锁。

## 解锁主人功能

在站点上任选一种方式打开口令框，输入 `RATINGS_TOKEN`：

- 2 秒内连续点 5 次左上角 logo 图标；
- 或者在页面上按 Konami 码：↑ ↑ ↓ ↓ ← → ← → B A。

口令验证通过后保存在这个浏览器里，换设备要重新输入。连续输错 3 次，这个 IP（IPv6 按 /64）锁定 15 分钟。

## 设置、修改和补设口令

主人口令就是 Worker secret `RATINGS_TOKEN`，站点和接口只认这一个值；它不存进 D1，也不在仓库里。建议用长随机串，例如 `openssl rand -hex 24`。

**首次设置**：一键部署时在设置页填 `RATINGS_TOKEN`；手动连接或命令行部署见 [部署](Deployment)。

**补设（部署时漏填）**：主人功能接口会返回 503 `not configured`。任选一种方式补上，保存后立即生效，不用重新部署：

- Cloudflare 控制台 → Workers & Pages → 你的 Worker → Settings → Variables and Secrets → 添加，类型选 **Secret**，名字 `RATINGS_TOKEN`；
- 或命令行：`npx wrangler secret put RATINGS_TOKEN`（按提示粘贴口令）。

**修改（换口令 / 怀疑泄露）**：

1. 先在已解锁的浏览器里点顶栏菜单的「退出」，清掉本地保存的旧口令。不退出的话，这些页面会继续带旧口令请求接口，每次都算一次输错，可能把你的 IP 锁 15 分钟。
2. 用上面同样的位置把 `RATINGS_TOKEN` 改成新值（控制台里编辑这个 secret，或再执行一次 `wrangler secret put RATINGS_TOKEN`）。
3. 出刊环境要同步改成同一个值：GitHub Actions 的仓库 secret `RATINGS_TOKEN`，或自托管时 `~/.config/newsp/env` 里的 `RATINGS_TOKEN`。不改的话出刊读不到主人反馈、上传不了信息源状态。
4. 本地开发如果用了 `.dev.vars`，也一起改。
5. 在各设备上用新口令重新解锁。

换口令不影响已有数据（收藏、垃圾箱、偏好、信息源设置都在 D1 里），也不影响已经生成的 MCP 令牌；MCP 令牌要单独在「MCP」页吊销。

**忘了口令**：口令没法找回，按上面「修改」的步骤直接设一个新的即可。

## 卡片反馈与偏好学习

| 操作 | 效果 |
| --- | --- |
| ♥ 点赞 | 多推这类内容 |
| 「＋」菜单 → 少推这类 | 少推这类内容 |
| 不感兴趣（删除） | 卡片进入倒计时后移到垃圾箱，并更强地少推；倒计时中可以撤销 |
| 收藏 | 加入收藏页，不影响推荐 |
| ✓ 收起 | 放进本栏底部「已收起 N 条」，只是整理，不算负反馈（访客也能用，只存在本机） |

下一期出刊时，脚本从线上接口读回这些反馈，偏好学习（`scripts/collect/learning.py`）据此调整排序。在「偏好与主题」页能看到学到的多推 / 少推关键词，可以逐条清除。

## 页面

| 页面 | 内容 |
| --- | --- |
| 首页 / `/<yyyy>/<mm>/<date>` | 当天日报；下午的增量可以「只看新增」 |
| 往期 | 日历和列表两种视图，搜索全部往期（标题、摘要、来源、标签） |
| 收藏 | 收藏的卡片，可同时列出 ♥ 点赞的 |
| 垃圾箱 | 删除的卡片，可恢复、永久删除或清空 |
| 订阅源 | 按类别管理信息源：单独开关、权重（−1…+2），X 账号按分组整体开关；保存后下一期生效 |
| 偏好与主题 | 反馈说明、学到的偏好、减少动效、主题（主人可收藏主题、设为默认） |
| 模型 | 当前使用的模型预设和用量（不显示 Key） |
| `/mcp-admin` | MCP 令牌管理 |

外观：每周一套固定外观（`editions/`），可以在设置页或顶栏中间的主题按钮切换，只对本次浏览有效；主人设的默认主题会同步到所有设备。

## 只读 MCP

在 `/mcp-admin` 生成令牌（服务器生成，只显示一次，数据库里只存哈希；可重新生成、吊销）。MCP 地址是 `https://<你的站点>/mcp`（Streamable HTTP），认证头 `Authorization: Bearer <令牌>`。例如 Claude Code：

```bash
claude mcp add --transport http newsp https://<你的站点>/mcp --header "Authorization: Bearer <令牌>"
```

工具（全部只读）：

| 工具 | 作用 |
| --- | --- |
| `search_news` | 按关键词、模块、标签、来源、日期搜索；`only` 只看收藏 / 点赞 |
| `get_item` | 单条详情：原标题、摘录、来源、指标、链接、规则得分、收藏 / 点赞状态 |
| `list_favorites` | 收藏 / 点赞列表，按收藏时间或发布日期排序 |
| `list_filters` | 模块、标签、来源、日期及数量 |
| `list_sources` | 订阅源列表、权重、开关和最近一次采集数（不含密钥和服务器地址） |

## 「深挖这条 / 自由指令」webhook

设置 Worker secret `AGENT_WEBHOOK_URL`（见 [配置](Configuration#worker-secrets)）后，卡片菜单出现「深挖这条」和「自由指令」。点击后 Worker 把卡片 JSON POST 到这个地址：

```json
{ "action": "deep_dive | command", "id": "sha256:…", "title_zh": "…", "title": "…", "url": "https://…", "source": "…", "date": "YYYY-MM-DD", "text": "自由指令的内容", "origin": "<站点域名>", "sent_at": "<ISO 时间>" }
```

认证头按 `AGENT_WEBHOOK_AUTH` 发送，10 秒超时。接收方可以是任何接受 JSON POST 的 agent、自动化或 bot。每天（北京时间）最多 20 次。
