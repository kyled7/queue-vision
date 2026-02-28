import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";

interface ValidateOptions {
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validate(schemas: ValidateOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Record<string, string>;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as Record<string, string>;
      }
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        const message = e.errors
          .map((err) => `${err.path.join(".")}: ${err.message}`)
          .join(", ");
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message },
        });
        return;
      }
      next(e);
    }
  };
}
