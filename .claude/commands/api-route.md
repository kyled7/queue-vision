# /api-route

Scaffold a new API route in packages/core.

## Usage
`/api-route <METHOD> <path>`

Example: `/api-route GET /queues/:name/jobs`

## What to generate

1. Create route handler in packages/core/src/routes/
2. Add Zod schema for path params and query params
3. Add error handling using the Result pattern
4. Register the route in packages/core/src/server.ts
5. Add a corresponding type to packages/core/src/api-types.ts

## Response format
Always use:
```typescript
// Success
res.json({ data: ... })

// Error
res.status(4xx).json({ error: { code: "ERROR_CODE", message: "..." } })
```