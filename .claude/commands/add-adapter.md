# /add-adapter

Scaffold a new QueueVision adapter package.

## Usage
`/add-adapter <name> <broker>`

Example: `/add-adapter sidekiq redis`

## What to generate

1. Create packages/adapter-{name}/ with:
   - package.json — name: qv-adapter-{name}
   - tsconfig.json extending root
   - src/index.ts — exports createAdapter factory
   - src/adapter.ts — class implementing QueueAdapter from packages/core/src/adapter.ts
   - src/types.ts — adapter-specific internal types
   - tests/adapter.test.ts — Testcontainers integration test skeleton

2. Stub all QueueAdapter interface methods with throw new Error("not implemented")

3. Add the package to the root pnpm-workspace.yaml

4. Add a TODO checklist at the top of adapter.ts:
```
// TODO:
// [ ] connect() / disconnect()
// [ ] listQueues()
// [ ] getJobs()
// [ ] getJob()
// [ ] retryJob()
// [ ] deleteJob()
// [ ] getMetrics()
// [ ] subscribe()
```

## Do NOT do
- Do not implement any methods (stubs only)
- Do not modify packages/core