# Notavia Creator

Notavia 是面向长期观点输出者的私有 AI 内容工作台。它把网页、语音、旧文章和随手记沉淀为可追溯素材，再帮助你完成选题、知乎长文、小红书图文、短视频口播稿和发布复盘。

核心原则：数据归用户，AI 引用能回到原文，没有私人来源的内容必须标记为模型补充。

## 当前能力

- 私有素材库：富文本、网页剪藏、Markdown 导入、语音转写、图片/音频/视频；网页图片会下载到本地，并保留正文结构与来源链接。
- 创作选题：核心问题、目标读者、明确结论、预期行动和状态流转。
- 混合检索：关键词与 Qdrant 语义检索合并，并允许人工固定素材。
- 带引用写作：生成知乎草稿，引用可回到原始素材，额外事实标记待核实。
- 七九风格检查：检查模糊观点、重复、套话、禁用表达、虚构经历和无来源事实。
- 多平台版本：知乎主稿转换为小红书图文和通用短视频口播稿。
- 发布记录：手工登记平台、链接和表现数据。
- 完整导出：Markdown 素材和包含选题、作品、引用、风格、修改、发布记录的 JSON 快照。
- 本地 Ollama 或任意 OpenAI 兼容模型。

## Docker 一键启动

要求：Docker Desktop 或 Docker Engine + Compose，建议至少 8GB 内存。

```bash
cp .env.example .env
./start.sh
```

打开 <http://localhost:8080>。首次启动会在后台下载 `.env` 中配置的 Ollama 模型。

公开部署前务必修改 `.env` 中的 `JWT_SECRET`，并通过 HTTPS 反向代理访问。

### 数据持久化

`start.sh` 默认把所有数据保存在宿主机的 `$HOME/.notavia/data`，删除容器、执行
`docker compose down` 或 `docker compose down -v` 都不会删除这个目录。也可以在 `.env`
中指定其他位置，建议使用绝对路径：

```env
NOTAVIA_DATA_DIR=/Volumes/MyDisk/NotaviaData
```

目录包含应用数据库与上传文件、Qdrant 索引、Ollama 模型、Whisper 缓存及可选的
PostgreSQL、Redis 数据。外置磁盘需要先挂载，并允许 Docker Desktop 访问该目录。

如果旧版本已经使用 Docker 命名卷，首次启动新版前执行：

```bash
./start.sh --migrate-volumes
```

脚本会停止服务，把旧卷只读复制到新的宿主机目录，保留旧卷用于回退，然后启动新版。
目标目录非空时迁移会拒绝执行，避免覆盖已有数据。

### 备份与恢复

应用侧可在左下角点击“完整导出”。服务器级完整备份使用：

```bash
./start.sh --backup
```

备份文件和 SHA-256 校验文件保存在 `${NOTAVIA_DATA_DIR}/backups`。恢复时执行：

```bash
./start.sh --restore /完整路径/notavia-20260718-120000.tar.gz
```

恢复需要输入 `RESTORE` 确认。脚本会先自动创建 `pre-restore` 备份，再替换当前数据。

## 本地开发

### 一键启动完整服务

首次启动前准备环境变量，然后运行统一启动脚本：

```bash
cp .env.example .env
./start.sh
```

脚本会检查宿主机数据目录、写入权限和磁盘空间，再构建并启动 Docker Compose 中的
全部服务。Web 入口：<http://localhost:8080>。

```bash
docker compose ps       # 查看服务状态
docker compose logs -f  # 查看全部日志
docker compose down     # 停止全部服务
```

### 单独启动前后端开发服务

要求：Node.js 22、pnpm 9+、Go 1.26。

```bash
pnpm install
./start-backend.sh
./start-frontend.sh
```

前端：<http://localhost:5173>，后端：<http://localhost:3001>。

## 环境变量

- `JWT_SECRET`：登录令牌签名密钥，公开部署必须修改。
- `WEB_PORT`：Web 端口，默认 `8080`。
- `CORS_ORIGIN`：允许的前端来源。
- `NOTAVIA_DATA_DIR`：宿主机数据目录；留空时 `start.sh` 使用 `$HOME/.notavia/data`。
- `OLLAMA_MODEL`：首次启动自动准备的本地模型，默认 `qwen2.5:1.5b`。
- `OLLAMA_URL`、`QDRANT_URL`、`WHISPER_BASE_URL`：AI 基础服务地址。
- `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`：可选云模型配置，也可在应用设置中按用户维护。

## 验证

```bash
cd apps/server && GOCACHE=/tmp/notavia-go-cache go test ./...
PATH="$HOME/.nvm/versions/node/v22.21.0/bin:$PATH" pnpm --filter web lint
PATH="$HOME/.nvm/versions/node/v22.21.0/bin:$PATH" pnpm --filter web build
docker compose config
```

## MVP 边界

Notavia 当前不做团队协作扩张、自动发布、平台数据抓取、AI 追热点、模型微调、图片/视频生成、SaaS 计费或移动原生 App。先连续自用 30 天，用真实作品验证是否节省时间。
