# 开发

## 环境

- **Node 22**（`package.json` 的 `engines`、`.nvmrc`）。测试里的 D1 替身用 `node:sqlite`，Node 20 跑不了。
- **Python 3.11+**：核心流水线只用标准库；[`requirements.txt`](https://github.com/lthero-big/newsp/blob/main/requirements.txt) 是可选依赖（`pillow` 图片尺寸、`trafilatura` 正文抽取、`pyarrow` Arena 榜 parquet），缺了会自动降级。
- 手机布局检查需要 Chrome 和 `playwright-core`（环境变量 `CHROME`，默认 `/usr/bin/google-chrome`；`PLAYWRIGHT_CORE` 指向 `playwright-core/index.mjs`）。

## 本地运行

```bash
npm ci
cp .dev.vars.example .dev.vars    # 本地主人口令（不要提交 .dev.vars）
npm run dev                       # 构建 + 本地 D1 迁移 + wrangler dev（站点 + 接口 + 本地 D1）
```

`data/` 里没有日报时，`npm run build` 用 `examples/data/` 的示例日报。

## npm 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run build` | `scripts/build.mjs`：`data/` → `dist/`（`NEWS_DATA_DIR` / `NEWS_DIST_DIR` 可改目录） |
| `npm run dev` | 构建 + `wrangler d1 migrations apply DB --local` + `wrangler dev` |
| `npm test` | Node 单测（`tests/*.test.mjs`）+ Python 单测（`tests/test_arena_top.py`、`scripts/collect/test_*.py`） |
| `npm run test:mobile` | 构建后跑手机布局检查（需要 Chrome） |
| `npm run validate` | 按 `schema/daily.schema.json` 校验日报 |
| `npm run deploy` | `wrangler deploy` + 远程 D1 迁移 |
| `npm run db:migrate` | 只执行远程 D1 迁移 |
| `npm run daily` / `npm run publish` | `scripts/daily.sh` / `scripts/publish.sh` |
| `npm run theme` | `scripts/theme.mjs` 主题工具 |

## 测试

- `tests/*.test.mjs` 直接调用 `functions/` 里的接口，D1 用 `tests/d1-sqlite.mjs`（`node:sqlite` 内存库，按顺序执行全部 `migrations/*.sql`），所以测的是真实 SQL；`tests/worker.test.mjs` 测 `src/worker.js` 的路由。
- `tests/mobile-layout.mjs`、`tests/invariants.mjs`、`tests/editions.mjs` 是出刊时的检查（`run-edition.sh --tests`），用 Chrome 渲染 `dist/`。默认通过 pipe 启动 Chrome，不占端口；设置 `NEWS_CDP_PORT` 可改为在指定端口开 CDP。

## CI

`.github/workflows/test.yml`：每次 push 和 PR 在 Ubuntu 上用 Node 22 + Python 3.12 跑 `npm ci && npm test`。

## 加一个接口

1. 在 `functions/api/<name>.js` 导出 `onRequestGet` / `onRequestPost` 等（以 `_` 开头的文件是辅助模块，不是路由）；
2. 在 `src/worker.js` 的 `ROUTES` 里加一行；
3. 需要新表时在 `migrations/` 加下一个编号的 `.sql`（只做增量改动），部署时自动执行。

## 文档

Wiki 的源文件在 `docs/wiki/`。改完后运行 `bash scripts/publish-wiki.sh` 同步到 GitHub Wiki（需要对 `newsp.wiki.git` 有推送权限；`WIKI_REMOTE` 可改远程地址）。设计规则见 [`docs/DESIGN-RULES.md`](https://github.com/lthero-big/newsp/blob/main/docs/DESIGN-RULES.md)。
