import { z } from "zod";

export const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3456),
  cors: z
    .object({
      origin: z.union([z.string(), z.array(z.string()), z.boolean()]).default(true),
      credentials: z.boolean().default(true),
    })
    .default({}),
  staticDir: z.string().optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;
