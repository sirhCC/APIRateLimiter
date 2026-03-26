import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { log } from '../utils/logger';
import { buildErrorResponse, getErrorMessage, sendError } from '../utils/httpErrors';
import { ERROR_CODES } from '../utils/errorCodes';

/**
 * Validation Middleware for API Rate Limiter
 * 
 * Provides request and response validation using Zod schemas with:
 * - Runtime type validation
 * - Detailed error messages
 * - Security validation
 * - TypeScript type safety
 */

interface ValidationOptions {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
  response?: z.ZodSchema;
  stripUnknown?: boolean;
}

interface ValidationError {
  field?: string;
  message: string;
  code?: string;
}

/**
 * Creates validation middleware for request data
 */
export function validateRequest(options: ValidationOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: ValidationError[] = [];

    try {
      // Validate request body
      if (options.body) {
        const result = options.body.safeParse(req.body);
        if (!result.success) {
          errors.push(...formatZodErrors(result.error, 'body'));
        } else {
          req.body = result.data;
        }
      }

      // Validate query parameters
      if (options.query) {
        const result = options.query.safeParse(req.query);
        if (!result.success) {
          errors.push(...formatZodErrors(result.error, 'query'));
        } else {
          // Store validated query data in a custom property
          (req as any).validatedQuery = result.data;
        }
      }

      // Validate URL parameters
      if (options.params) {
        const result = options.params.safeParse(req.params);
        if (!result.success) {
          errors.push(...formatZodErrors(result.error, 'params'));
        } else {
          // Store validated params data in a custom property
          (req as any).validatedParams = result.data;
        }
      }

      if (errors.length > 0) {
        sendError(res, req, 400, 'Validation Error', 'Request validation failed', {
          code: ERROR_CODES.VALIDATION.REQUEST_FAILED,
          details: errors,
        });
        return;
      }

      // Store response schema for later validation
      if (options.response) {
        res.locals.responseSchema = options.response;
      }

      next();
    } catch (error) {
      log.system('Validation middleware error', {
        error: getErrorMessage(error),
        severity: 'medium' as const,
        endpoint: req.path,
        method: req.method
      });
      sendError(res, req, 500, 'Internal Validation Error', 'An error occurred during request validation', {
        code: ERROR_CODES.VALIDATION.INTERNAL_ERROR,
      });
    }
  };
}

/**
 * Response validation middleware
 * Validates response data before sending to client
 */
export function validateResponse() {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json;

    res.json = function(body: any) {
      try {
        const responseSchema = res.locals.responseSchema;
        const isErrorResponse = res.statusCode >= 400 || Boolean(body?.error);
        
        if (responseSchema && !isErrorResponse) {
          const result = responseSchema.safeParse(body);
          
          if (!result.success) {
            log.system('Response validation failed', {
              endpoint: req.path,
              method: req.method,
              severity: 'medium' as const,
              errors: result.error.issues.map((issue: any) => issue.message),
              metadata: { 
                validationErrors: result.error.issues
              }
            });

            // In development, return validation error
            if (process.env.NODE_ENV === 'development') {
              return originalJson.call(this, buildErrorResponse(req, 'Response Validation Error', 'Response validation failed', {
                code: ERROR_CODES.VALIDATION.RESPONSE_FAILED,
                details: formatZodErrors(result.error, 'response'),
                statusCode: 500,
              }));
            }

            // In production, log error but send sanitized response
            return originalJson.call(this, buildErrorResponse(req, 'Internal Server Error', 'An error occurred while processing your request', {
              code: ERROR_CODES.SYSTEM.INTERNAL_SERVER_ERROR,
              statusCode: 500,
            }));
          }

          // Use validated data
          body = result.data;
        }

        return originalJson.call(this, body);
      } catch (error) {
        log.system('Response validation middleware error', {
          error: getErrorMessage(error),
          severity: 'medium' as const,
          endpoint: req.path,
          method: req.method
        });

        return originalJson.call(this, buildErrorResponse(req, 'Internal Server Error', 'An error occurred while processing your request', {
          code: ERROR_CODES.SYSTEM.INTERNAL_SERVER_ERROR,
          statusCode: 500,
        }));
      }
    };

    next();
  };
}

/**
 * Format Zod validation errors into a consistent structure
 */
function formatZodErrors(error: z.ZodError, context: string): ValidationError[] {
  return error.issues.map(issue => ({
    field: issue.path.length > 0 ? `${context}.${issue.path.join('.')}` : context,
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validation helper function for standalone validation
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: ValidationError[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: formatZodErrors(result.error, 'data'),
  };
}

/**
 * Create a validation middleware with pre-configured schemas for common endpoints
 */
export function createValidationMiddleware(options: ValidationOptions) {
  return [validateRequest(options), validateResponse()];
}

/**
 * Validation middleware for JWT endpoints
 */
export function validateJwtEndpoint(bodySchema?: z.ZodSchema, responseSchema?: z.ZodSchema) {
  return createValidationMiddleware({
    body: bodySchema,
    response: responseSchema,
  });
}

/**
 * Validation middleware for API key endpoints
 */
export function validateApiKeyEndpoint(
  bodySchema?: z.ZodSchema,
  querySchema?: z.ZodSchema,
  paramsSchema?: z.ZodSchema,
  responseSchema?: z.ZodSchema
) {
  return createValidationMiddleware({
    body: bodySchema,
    query: querySchema,
    params: paramsSchema,
    response: responseSchema,
  });
}

/**
 * Validation middleware for rule management endpoints
 */
export function validateRuleEndpoint(
  bodySchema?: z.ZodSchema,
  paramsSchema?: z.ZodSchema,
  responseSchema?: z.ZodSchema
) {
  return createValidationMiddleware({
    body: bodySchema,
    params: paramsSchema,
    response: responseSchema,
  });
}

/**
 * Validation middleware for system endpoints (no body, response only)
 */
export function validateSystemEndpoint(
  querySchema?: z.ZodSchema,
  responseSchema?: z.ZodSchema
) {
  return createValidationMiddleware({
    query: querySchema,
    response: responseSchema,
  });
}
