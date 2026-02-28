import { Router } from "express";
import type { QueueAdapter } from "../adapter.js";
import { validate } from "../middleware/validation.js";
import {
  QueueNameParamSchema,
  GetJobsQuerySchema,
  JobIdParamSchema,
} from "../schemas/api.js";
import { ApiHttpError } from "../middleware/error-handler.js";
import { serializeJob } from "./serialize.js";

export function createQueueRoutes(adapter: QueueAdapter): Router {
  const router = Router();

  // GET /api/v1/queues — list all queues with counts
  router.get("/", async (_req, res, next) => {
    try {
      const queues = await adapter.listQueues();
      res.json({ data: queues });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/v1/queues/:name/jobs — paginated jobs with status filter
  router.get(
    "/:name/jobs",
    validate({ params: QueueNameParamSchema, query: GetJobsQuerySchema }),
    async (req, res, next) => {
      try {
        const { name } = req.params as { name: string };
        const { status, page, limit } = req.query as unknown as {
          status: string;
          page: number;
          limit: number;
        };

        const jobs = await adapter.getJobs(
          name,
          status as "waiting" | "active" | "completed" | "failed" | "delayed" | "paused",
          { page, limit },
        );

        res.json({
          data: jobs.map(serializeJob),
          pagination: { page, limit },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  // GET /api/v1/queues/:name/jobs/:id — single job detail
  router.get(
    "/:name/jobs/:id",
    validate({ params: JobIdParamSchema }),
    async (req, res, next) => {
      try {
        const { name, id } = req.params as { name: string; id: string };

        try {
          const job = await adapter.getJob(name, id);
          res.json({ data: serializeJob(job) });
        } catch {
          throw new ApiHttpError(
            404,
            "NOT_FOUND",
            `Job "${id}" not found in queue "${name}"`,
          );
        }
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}
