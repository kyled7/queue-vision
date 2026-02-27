# Contributing to QueueVision

Thank you for your interest in contributing! This guide covers everything you
need to get started, with a focus on the most impactful contribution type:
**adapters**.

## Table of Contents
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Building an Adapter](#building-an-adapter)
- [UI Contributions](#ui-contributions)
- [Submitting a PR](#submitting-a-pr)
- [Code Standards](#code-standards)

---

## Getting Started

```bash
git clone https://github.com/yourhandle/queue-vision
cd queue-vision
pnpm install
pnpm dev        # starts core server + UI in watch mode
```

**Prerequisites:** Node 20+, pnpm 8+, Docker (for integration tests)

To verify everything works:
```bash
pnpm test       # runs all tests
pnpm build      # full production build
```

---

## Project Structure

```
packages/
  core/            # Server, REST API, SSE, QueueAdapter interface
  adapter-bullmq/  # BullMQ implementation (reference adapter)
  adapter-sidekiq/ # Sidekiq implementation
  ui/              # React frontend
```

When in doubt, read packages/adapter-bullmq — it is the **reference
implementation** for how all adapters should be structured.

---

## Building an Adapter

This is the highest-value contribution you can make. Each adapter unlocks
QueueVision for an entirely new ecosystem.

### Step 1 — Check the issue tracker first
Open a GitHub issue or comment on an existing one before starting. We want to
avoid two people building the same adapter simultaneously.

### Step 2 — Scaffold the package

Use the Claude Code slash command if you're using Claude Code:
```
/add-adapter <name> <broker>
```

Or manually create packages/adapter-{name}/ mirroring the structure of
packages/adapter-bullmq/.

Package naming convention: qv-adapter-{name}

### Step 3 — Implement the QueueAdapter interface

The QueueAdapter interface lives in packages/core/src/adapter.ts.
Your adapter class must implement every method in that interface:

```typescript
export class MyAdapter implements QueueAdapter {
  readonly name = "myadapter";
  readonly displayName = "My Adapter";

  async connect() { ... }
  async disconnect() { ... }
  async listQueues() { ... }
  async getJobs(queue, status, opts) { ... }
  async getJob(queue, id) { ... }
  async retryJob(queue, id) { ... }
  async deleteJob(queue, id) { ... }
  async getMetrics(queue) { ... }
  subscribe(queue, cb) { ... }
}

export function createAdapter(config: MyAdapterConfig): QueueAdapter {
  return new MyAdapter(config);
}
```

All methods must be implemented. No method should be left as a stub in a PR.

### Step 4 — Write integration tests (required)

Adapter tests must use **Testcontainers** (the npm package) — no mocking
the broker. This ensures the adapter works against real broker behavior.

```typescript
// tests/adapter.test.ts
describe("MyAdapter", () => {
  let container;

  beforeAll(async () => {
    // spin up a real Redis container
    container = await new GenericContainer("redis:7")
      .withExposedPorts(6379)
      .start();
  });

  afterAll(() => container.stop());

  it("listQueues returns correct counts", async () => {
    // seed some jobs, then assert
  });
});
```

Every method in the interface needs at least one test.
See packages/adapter-bullmq/tests/ for examples.

### Step 5 — Document the broker's data model

Add a BROKER.md inside your adapter package explaining:
- What Redis keys / DB tables are read
- Any version constraints (e.g. "requires Sidekiq 6.5+")
- Known limitations

This is critical for long-term maintainability.

### Adapter Checklist
- [ ] All QueueAdapter methods implemented (no stubs)
- [ ] Testcontainers integration tests for every method
- [ ] BROKER.md documenting the data model
- [ ] package.json with correct name: qv-adapter-{name}
- [ ] Added to the adapter table in README.md
- [ ] No `any` types — use `unknown` and narrow explicitly

---

## UI Contributions

The UI lives in packages/ui. It's a React + Vite + Tailwind app.

- Use **Tanstack Query** for all server state — no ad-hoc useEffect fetching
- Keep components in src/components/ — no business logic in components
- API calls go in src/api/ — one file per resource (queues.ts, jobs.ts)
- We do not use a component library — keep the dependency footprint small

---

## Submitting a PR

1. **Fork** the repo and create a branch: feat/adapter-sidekiq or fix/bullmq-delayed-count
2. Keep PRs focused — one adapter or one fix per PR
3. Run `pnpm lint && pnpm test` before pushing
4. Fill in the PR template — especially the "how to test" section
5. For new adapters, include a screen recording or screenshot of the UI working

### Commit format
We use Conventional Commits:
```
feat(adapter-sidekiq): implement listQueues and getJobs
fix(bullmq): correct delayed job count off-by-one
docs: add Celery adapter development notes
```

---

## Code Standards

- **TypeScript strict mode** — no exceptions
- **No `any`** — use `unknown` and type guards
- **Zod** for all external input validation (config, API params)
- **Result pattern** for error handling — avoid uncaught throws in adapter methods
- **No default exports** in core or adapter packages (named exports only)
- Formatting enforced via Prettier — run `pnpm format` before committing

---

## Questions?

Open a GitHub Discussion or drop a comment on the relevant issue. We're happy
to help you scope your contribution before you write a single line of code.