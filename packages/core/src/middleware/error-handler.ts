import type { Request, Response, NextFunction } from "express";

export class ApiHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiHttpError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  const message =
    err instanceof Error ? err.message : "An unexpected error occurred";

  console.error("[queue-vision] Unhandled error:", err);

  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message },
  });
}
