<div align="center">
  <h1>QueueVision</h1>
  <p>One dashboard for every job queue.</p>

  ![License](https://img.shields.io/badge/license-MIT-blue)
  ![npm](https://img.shields.io/npm/v/queue-vision)
  ![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)
</div>

---

QueueVision is a self-hosted, standalone dashboard for inspecting and managing
background jobs. Connect it to any Redis or PostgreSQL broker — no changes to
your application code required.

> ⚠️ Currently in active development. v0.1 targets BullMQ support.

## Why QueueVision?

Existing tools (Bull Board, Sidekiq Web UI) must be **embedded into your
application**. QueueVision connects **externally** — meaning your ops team,
SREs, and developers can use it without touching application code or
understanding your framework.

| Feature | Bull Board | Sidekiq Web | QueueVision |
|---|---|---|---|
| Multi-queue-library support | ❌ | ❌ | ✅ |
| Standalone (no app embedding) | ❌ | ❌ | ✅ |
| Cross-service unified view | ❌ | ❌ | ✅ |
| Live job feed | ❌ | ❌ | ✅ |
| Docker / npx distribution | ❌ | ❌ | ✅ |

## Supported Adapters

| Adapter | Status | Broker |
|---|---|---|
| BullMQ | ✅ v0.1 | Redis |
| Sidekiq | 🚧 v0.3 | Redis |
| Celery | 📋 Planned | Redis / RabbitMQ |
| Oban | 📋 Planned | PostgreSQL |

## Quick Start

```bash
# Requires Redis running locally
npx queue-vision --redis redis://localhost:6379
```

Then open **http://localhost:3456**.

### Multi-service config

```yaml
# queue-vision.yml
connections:
  - name: "Payments Service"
    adapter: bullmq
    redis: redis://payments-redis:6379
    queues: [payments, refunds]

  - name: "Email Service"
    adapter: bullmq
    redis: redis://email-redis:6379
```

```bash
npx queue-vision --config ./queue-vision.yml
```

### Docker

```bash
docker run -p 3456:3456 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  ghcr.io/yourhandle/queue-vision:latest
```

## Development

```bash
git clone https://github.com/yourhandle/queue-vision
cd queue-vision
pnpm install
pnpm dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for adapter development guide.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design and adapter interface.

## License

MIT
