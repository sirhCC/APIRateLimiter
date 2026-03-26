import { Request, Response } from 'express';
import { ErrorResponse } from './schemas';

interface ErrorResponseOptions {
  code?: string;
  details?: ErrorResponse['details'];
  path?: string;
  statusCode?: number;
  extra?: Record<string, unknown>;
}

export function buildErrorResponse(
  req: Request,
  error: string,
  message: string,
  options: ErrorResponseOptions = {}
): ErrorResponse & Record<string, unknown> {
  const response: ErrorResponse & Record<string, unknown> = {
    code: options.code,
    error,
    message,
    timestamp: new Date().toISOString(),
    path: options.path ?? req.path,
    statusCode: options.statusCode,
  };

  if (options.details) {
    response.details = options.details;
  }

  if (options.extra) {
    Object.assign(response, options.extra);
  }

  return response;
}

export function sendError(
  res: Response,
  req: Request,
  statusCode: number,
  error: string,
  message: string,
  options: Omit<ErrorResponseOptions, 'statusCode'> = {}
): void {
  res.status(statusCode).json(
    buildErrorResponse(req, error, message, {
      ...options,
      statusCode,
    })
  );
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
