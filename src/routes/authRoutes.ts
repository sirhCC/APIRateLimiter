import { Express, Request, Response, RequestHandler } from 'express';
import { ApiRateLimiterConfig } from '../types';
import { requireJWT, requirePermission, requireRole } from '../middleware/jwtAuth';
import { validateJwtEndpoint, validateSystemEndpoint } from '../middleware/validation';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  VerifyTokenResponseSchema,
} from '../utils/schemas';
import { getErrorMessage, sendError } from '../utils/httpErrors';
import { ERROR_CODES } from '../utils/errorCodes';
import { authenticateDemoUser, buildDemoLoginResponse, signDemoJwtToken } from '../services/demoAuthService';

export interface RegisterAuthRoutesOptions {
  appConfig: ApiRateLimiterConfig;
  authRateLimiter: RequestHandler;
}

export function registerAuthRoutes(app: Express, options: RegisterAuthRoutesOptions): void {
  const { appConfig, authRateLimiter } = options;
  const demoEndpointsEnabled = appConfig.security.demoEndpointsEnabled;

  app.post('/auth/login', authRateLimiter, validateJwtEndpoint(LoginRequestSchema, LoginResponseSchema), async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      const authResult = authenticateDemoUser(email, password, appConfig.security.demoUsersEnabled);
      if (!authResult.ok) {
        sendError(res, req, authResult.status, authResult.error, authResult.message, {
          code: authResult.code,
        });
        return;
      }

      const token = signDemoJwtToken(appConfig.security.jwtSecret, email, authResult.user);
      res.json(buildDemoLoginResponse(email, authResult.user, token));
    } catch (error) {
      sendError(res, req, 500, 'Authentication failed', getErrorMessage(error), {
        code: ERROR_CODES.AUTH.LOGIN_FAILED,
      });
    }
  });

  app.get('/auth/verify', requireJWT(appConfig.security.jwtSecret), validateSystemEndpoint(undefined, VerifyTokenResponseSchema), (req: Request, res: Response) => {
    res.json({
      valid: true,
      user: req.user ? {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        tier: req.user.tier,
      } : undefined,
      message: 'Token is valid',
    });
  });

  if (demoEndpointsEnabled) {
    app.get('/admin/users', requireJWT(appConfig.security.jwtSecret), requireRole(['admin']), (req, res) => {
      res.json({
        message: 'Admin endpoint accessed successfully',
        user: req.user,
        data: {
          totalUsers: 1234,
          activeUsers: 892,
          premiumUsers: 156,
        },
      });
    });

    app.get('/premium/features', requireJWT(appConfig.security.jwtSecret), requireRole(['admin', 'premium']), (req, res) => {
      res.json({
        message: 'Premium features accessed',
        user: req.user,
        features: [
          'Advanced Analytics',
          'Priority Support',
          'Custom Rate Limits',
          'API Access',
        ],
      });
    });

    app.get('/secure/data', requireJWT(appConfig.security.jwtSecret), requirePermission(['read', 'write']), (req, res) => {
      res.json({
        message: 'Secure data accessed',
        user: req.user,
        data: {
          sensitive: 'This requires read and write permissions',
          timestamp: new Date().toISOString(),
        },
      });
    });
  }
}
