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

export interface RegisterAuthRoutesOptions {
  appConfig: ApiRateLimiterConfig;
  authRateLimiter: RequestHandler;
}

export function registerAuthRoutes(app: Express, options: RegisterAuthRoutesOptions): void {
  const jwt = require('jsonwebtoken');
  const { appConfig, authRateLimiter } = options;

  app.post('/auth/login', authRateLimiter, validateJwtEndpoint(LoginRequestSchema, LoginResponseSchema), async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      if (!appConfig.security.demoUsersEnabled) {
        sendError(res, req, 503, 'Demo authentication disabled', 'Demo users are disabled. Please configure your own authentication system.', {
          code: ERROR_CODES.AUTH.DEMO_DISABLED,
        });
        return;
      }

      const demoUsers = {
        'admin@example.com': { id: 'admin-1', role: 'admin', tier: 'enterprise' },
        'premium@example.com': { id: 'premium-1', role: 'premium', tier: 'premium' },
        'user@example.com': { id: 'user-1', role: 'user', tier: 'free' },
        'guest@example.com': { id: 'guest-1', role: 'guest', tier: 'free' },
      } as const;

      const user = demoUsers[email as keyof typeof demoUsers];
      if (!user || password !== 'demo123') {
        sendError(res, req, 401, 'Invalid credentials', 'Use one of the demo accounts: admin@example.com, premium@example.com, user@example.com, guest@example.com with password: demo123', {
          code: ERROR_CODES.AUTH.INVALID_CREDENTIALS,
        });
        return;
      }

      const token = jwt.sign(
        {
          id: user.id,
          email,
          role: user.role,
          tier: user.tier,
          permissions: user.role === 'admin' ? ['read', 'write', 'admin'] : ['read'],
        },
        appConfig.security.jwtSecret,
        {
          expiresIn: '24h',
          algorithm: 'HS256',
        }
      );

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email,
          role: user.role,
          tier: user.tier,
        },
        expiresIn: '24h',
      });
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
