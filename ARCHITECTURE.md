# QueueVision — Architecture

## System Overview

QueueVision is structured as a monorepo with clear separation between
the core server, adapter implementations, and the UI.

```
Browser (React UI)
       │
       │  REST API + SSE
       ▼
Core Server (Express)
       │
       ▼
Adapter Layer (interface-driven)
       │
  ┌────┴────┐
  │         │
BullMQ   Sidekiq  ... (future adapters)
  │         │
Redis    Redis
```

## Packages

### packages/core
The heart of the system. Owns:
- The QueueAdapter TypeScript interface — the contract all adapters implement
- The Express HTTP server and all REST routes
- The SSE engine for streaming job events to the browser
- Config loading and validation (Zod schemas)
- The CLI entry point (bin/queue-vision.ts)

Package name: queue-vision (published to npm)

### packages/adapter-bullmq
Implements QueueAdapter against BullMQ's Redis data model.
Uses ioredis directly to read BullMQ's key structure — does NOT
import BullMQ as a dependency (avoids version coupling).

Package name: qv-adapter-bullmq

Key Redis keys read:
```
bull:{queue}:waiting      # list of waiting job IDs
bull:{queue}:active       # list of active job IDs
bull:{queue}:completed    # sorted set of completed job IDs
bull:{queue}:failed       # sorted set of failed job IDs
bull:{queue}:{id}         # hash of job data
bull:{queue}:meta         # queue metadata
```

### packages/ui
Vite + React 18 SPA. Communicates with core server only via:
- REST: /api/v1/* — fetches queue/job data
- SSE: /api/v1/events — real-time job feed

State management via Tanstack Query (server state) only.
No global client state library needed at this scale.

## API Design

Base path: /api/v1

```
GET  /queues                          List all queues with counts
GET  /queues/:name/jobs               Paginated job list (status filter)
GET  /queues/:name/jobs/:id           Single job detail
POST /queues/:name/jobs/:id/retry     Retry a failed job (v0.2)
DELETE /queues/:name/jobs/:id         Delete a job (v0.2)
GET  /events                          SSE stream of job events
```

### SSE Event Shape
```typescript
type JobEvent = {
  type: "job:added" | "job:active" | "job:completed" | "job:failed";
  queue: string;
  jobId: string;
  timestamp: string;
}
```

## Adapter Contract

The QueueAdapter interface is the core abstraction. Any adapter must:

1. Be a class implementing QueueAdapter (defined in packages/core/src/adapter.ts)
2. Live in its own package (packages/adapter-{name})
3. Have integration tests using Testcontainers — no mocks for the broker
4. Export a factory function: createAdapter(config: AdapterConfig): QueueAdapter

Package naming convention: qv-adapter-{name}

See docs/adapters.md for the full guide on building an adapter.

## Real-time Architecture

QueueVision uses Server-Sent Events (SSE) over WebSockets because:
- Unidirectional: server → browser only (no need for bidirectional)
- HTTP-native: works through proxies, no upgrade handshake
- Auto-reconnect built into the browser EventSource API
- Simpler to implement and debug

The adapter's subscribe() method taps into the broker's native
pub/sub mechanism (Redis keyspace notifications for Redis-based adapters).

## Distribution

### npx
packages/core ships a bin entry. The UI is bundled at build time
and served as static files from Express. Single install or
npx queue-vision gets you everything.

### Docker
Multi-stage Dockerfile: build stage compiles TypeScript and bundles UI,
runtime stage is node:20-alpine with only production artifacts.
Target image size: < 150MB.

## Future Considerations

- **Auth:** Basic auth in v1.0 via config. OAuth/SSO as a paid cloud feature.
- **Persistence:** No database in self-hosted. Cloud version adds a TimescaleDB
  layer for historical metrics.
- **Plugin API:** Adapters eventually become installable npm packages,
  not bundled in the monorepo.