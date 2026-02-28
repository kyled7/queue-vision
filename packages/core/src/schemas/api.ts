import { z } from "zod";

const JOB_STATUSES = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
] as const;

export const QueueNameParamSchema = z.object({
  name: z.string().min(1, "Queue name is required"),
});

export const JobIdParamSchema = z.object({
  name: z.string().min(1, "Queue name is required"),
  id: z.string().min(1, "Job ID is required"),
});

export const GetJobsQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional().default("waiting"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export type QueueNameParam = z.infer<typeof QueueNameParamSchema>;
export type JobIdParam = z.infer<typeof JobIdParamSchema>;
export type GetJobsQuery = z.infer<typeof GetJobsQuerySchema>;
