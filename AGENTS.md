# Repository Guidelines

## Project Structure & Module Organization

Notavia is a pnpm workspace with a React frontend and Go backend.

- `apps/web/src/`: Vite/React app. Pages are in `pages/`, UI in `components/`, API clients in `services/`, state in `stores/`, and CSS in `styles/`.
- `apps/web/public/` and `apps/web/src/assets/`: static assets.
- `apps/server/cmd/server/`: Go service entrypoint.
- `apps/server/internal/`: backend configuration, handlers, middleware, models, services, and `*_test.go` files.
- `docker-compose.yml`: complete local stack, including Ollama, Qdrant, Whisper, Redis, API, and web services.

## Build, Test, and Development Commands

Use Node 22 and pnpm 9.

```bash
pnpm install --frozen-lockfile
pnpm --filter web dev                # Vite on localhost:5173
cd apps/server && go run ./cmd/server # API on localhost:3001
pnpm --filter web lint
pnpm --filter web build              # type-check and production build
cd apps/server && go test ./...
docker compose up -d --build         # complete local stack
docker compose down
```

Copy `.env.example` to `.env` before the first Docker startup. The Docker UI is available at `http://localhost:8080`.

## Coding Style & Naming Conventions

Use two-space indentation in TypeScript/TSX and `gofmt` in Go. React components and exported Go types use `PascalCase`; TypeScript functions and variables use `camelCase`. Keep handlers thin and move reusable parsing, security, or storage logic into focused helpers. Run `pnpm format` for TypeScript, TSX, and Markdown.

## Testing Guidelines

Use Go’s `testing` package. Name files `*_test.go` and tests `TestFeatureBehavior`. Add focused tests for parsing, user isolation, authorization, storage cleanup, and AI fallbacks. No coverage threshold is enforced, but bug fixes should include a regression test. Before submitting, run Go tests, frontend lint/build, and `docker compose config --quiet`.

## Commit & Pull Request Guidelines

Commit subjects must start with one of these prefixes: `Feat` for new functionality, `Refactor` for behavior-preserving restructuring, or `Fix` for defect corrections. Write the description in Chinese using the format `<Type>: <中文说明>`, for example `Feat: 支持网页图片本地化导入`, `Refactor: 拆分网页剪藏解析逻辑`, or `Fix: 修复素材永久删除失败`.

Pull requests should explain the outcome, list verification commands, identify configuration or migration changes, and link the issue. Include screenshots for UI changes and request/response examples for APIs. Do not commit `.env`, credentials, databases, uploads, or build output.

Dependency upgrades must be reviewed and submitted manually. Do not enable Dependabot version-update pull requests or any automation that pushes dependency branches to GitHub. Security alerts may remain enabled, but automated security-update pull requests require explicit maintainer approval before they are enabled.

## Security & Configuration Tips

Keep all resources scoped to the authenticated user. Treat imported HTML, remote URLs, filenames, and model output as untrusted. Preserve source attribution, reject private-network URL fetching, and avoid exposing uploaded assets without ownership checks.
