# QueueVision — Claude Code Context

## Project Overview
QueueVision (QV) is a self-hosted, universal background job dashboard.
It connects externally to brokers (Redis, PostgreSQL) and provides a unified
UI to inspect, debug, and manage jobs across multiple queue libraries.

**Core value prop:** Standalone operation — no app embedding required.

## Monorepo Structure
```
/
├── packages/
│   ├── core/            # QueueAdapter interface, Express server, REST API, SSE engine
│   ├── adapter-bullmq/  # BullMQ adapter (v0.1 target)
│   ├── adapter-sidekiq/ # Sidekiq adapter (v0.3)
│   └── ui/              # React frontend (Vite + Tanstack Query)
├── docker/
│   └── Dockerfile
├── docs/
│   ├── adapters.md
│   └── architecture.md
├── examples/
│   ├── bullmq-basic/
│   └── multi-service/
├── .claude/
│   └── commands/        # Custom slash commands (see below)
├── CLAUDE.md            # This file
├── ARCHITECTURE.md
└── README.md
```

## Tech Stack
- **Runtime:** Node.js 20+, TypeScript 5+
- **Package manager:** pnpm with workspaces
- **Backend:** Express, ioredis, SSE (no WebSockets)
- **Frontend:** React 18, Vite, Tanstack Query, Tailwind CSS
- **Testing:** Vitest, Testcontainers (spins up real Redis for adapter tests)
- **Build:** tsup for packages, Vite for UI
- **Distribution:** npx CLI entry, Docker image (GHCR)

## Key Interfaces — Do Not Change Without Discussion

```typescript
// packages/core/src/adapter.ts
interface QueueAdapter {
  readonly name: string;           // e.g. "bullmq", "sidekiq"
  readonly displayName: string;    // e.g. "BullMQ", "Sidekiq"
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listQueues(): Promise<QueueSummary[]>;
  getJobs(queue: string, status: JobStatus, opts: PaginationOpts): Promise<Job[]>;
  getJob(queue: string, id: string): Promise<Job>;
  retryJob(queue: string, id: string): Promise<void>;
  deleteJob(queue: string, id: string): Promise<void>;
  getMetrics(queue: string): Promise<QueueMetrics>;
  subscribe(queue: string, cb: (event: JobEvent) => void): Unsubscribe;
}

type JobStatus = "waiting" | "active" | "completed" | "failed" | "delayed" | "paused";

interface Job {
  id: string;
  name: string;
  queue: string;
  status: JobStatus;
  data: unknown;
  result?: unknown;
  error?: { message: string; stack?: string };
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  finishedAt?: Date;
  delay?: number;
}

interface QueueSummary {
  name: string;
  counts: Record<JobStatus, number>;
  isPaused: boolean;
}

interface QueueMetrics {
  throughput: { timestamp: Date; count: number }[];
  failureRate: number;
  avgProcessingTimeMs: number;
}
```

## Config File Format (queue-vision.yml)
```yaml
connections:
  - name: "My Service"
    adapter: bullmq
    redis: redis://localhost:6379
    queues: []  # empty = all queues
```

## CLI Entry Point
```bash
npx queue-vision --redis redis://localhost:6379
npx queue-vision --config ./queue-vision.yml
npx queue-vision --port 3456  # default port
```

## Current Milestone: v0.1
Focus only on:
1. BullMQ adapter — listQueues, getJobs, getJob (read-only)
2. REST API — GET /queues, GET /queues/:name/jobs, GET /queues/:name/jobs/:id
3. SSE endpoint — GET /events (job status changes)
4. React UI — queue list sidebar, job table, job detail panel

Do NOT build yet: auth, write operations, charts, multi-adapter support.

## Coding Conventions
- All packages in TypeScript strict mode
- Zod for all config/input validation
- No `any` types — use `unknown` and narrow
- Error handling: use Result<T, E> pattern not throw-everywhere
- Commits: conventional commits (feat:, fix:, chore:, docs:)
- Every adapter must have integration tests using Testcontainers

## REST API Conventions
- Base path: `/api/v1`
- Pagination: `?page=1&limit=25`
- Errors: `{ error: { code: string, message: string } }`
- All timestamps as ISO 8601 strings

## Custom Slash Commands
See `.claude/commands/` for project-specific commands:
- `/add-adapter` — scaffold a new adapter package
- `/test-adapter` — run integration tests for a specific adapter
- `/api-route` — scaffold a new API route with validation

## Do Not Touch
- The `QueueAdapter` interface shape in `packages/core/src/adapter.ts`
- The config YAML schema (breaking change for users)
- Port default (3456) without a major version bump