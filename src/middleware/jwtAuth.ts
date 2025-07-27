import { Request, Response, NextFunction } from 'express';
import jwt, { Algorithm } from 'jsonwebtoken';

// Extend Express Request type to include JWT user data
declare global {
  namespace Express {
    interface Request {
      user?: JWTUserData;
      isJWTAuthenticated?: boolean;
      jwtRateLimit?: {
        windowMs: number;
        maxRequests: number;
        algorithm: 'token-bucket' | 'sliding-window' | 'fixed-window';
        burstCapacity?: number;
      };
    }
  }
}

export interface JWTUserData {
  id: string;
  email?: string;
  role?: string;
  tier?: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
}

export interface JWTAuthOptions {
  secret: string;
  algorithms?: Algorithm[];
  required?: boolean;
  headerName?: string;
  cookieName?: string;
  queryParamName?: string;
  onTokenValidated?: (req: Request, user: JWTUserData) => void;
  onTokenInvalid?: (req: Request, res: Response, error: any) => void;
  roleBasedRateLimit?: {
    [role: string]: {
      windowMs: number;
      maxRequests: number;
      algorithm: 'token-bucket' | 'sliding-window' | 'fixed-window';
      burstCapacity?: number;
    };
  };
}

/**
 * JWT Authentication Middleware
 * Validates JWT tokens and attaches user data to request
 */
export function createJWTAuthMiddleware(options: JWTAuthOptions) {
  const {
    secret,
    algorithms = ['HS256'],
    required = false,
    headerName = 'authorization',
    cookieName = 'jwt_token',
    queryParamName = 'token',
    onTokenValidated,
    onTokenInvalid,
    roleBasedRateLimit,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract token from various sources
      let token: string | undefined;

      // 1. Authorization header (Bearer token)
      const authHeader = req.headers[headerName.toLowerCase()] as string;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }

      // 2. Cookie
      if (!token && req.cookies && req.cookies[cookieName]) {
        token = req.cookies[cookieName];
      }

      // 3. Query parameter
      if (!token && req.query[queryParamName]) {
        token = req.query[queryParamName] as string;
      }

      // If no token found
      if (!token) {
        if (required) {
          if (onTokenInvalid) {
            onTokenInvalid(req, res, new Error('No token provided'));
            return;
          }
          
          res.status(401).json({
            error: 'Unauthorized',
            message: 'JWT token is required',
          });
          return;
        }
        
        // Continue without JWT authentication
        return next();
      }

      // Verify and decode token
      const decoded = jwt.verify(token, secret, { algorithms }) as JWTUserData & { [key: string]: any };
      
      // Attach user data to request
      req.user = decoded;
      req.isJWTAuthenticated = true;

      // Set role-based rate limiting if configured
      if (roleBasedRateLimit && decoded.role && roleBasedRateLimit[decoded.role]) {
        req.jwtRateLimit = roleBasedRateLimit[decoded.role];
      }

      // Call validation callback
      if (onTokenValidated) {
        onTokenValidated(req, decoded);
      }

      console.log(`✅ JWT authenticated: ${decoded.email || decoded.id} (${decoded.role || 'no-role'})`);
      next();

    } catch (error: any) {
      console.log(`❌ JWT authentication failed: ${error.message}`);
      
      if (required) {
        if (onTokenInvalid) {
          onTokenInvalid(req, res, error);
          return;
        }
        
        res.status(401).json({
          error: 'Invalid token',
          message: error.message === 'jwt expired' 
            ? 'Token has expired' 
            : 'Invalid or malformed JWT token',
        });
        return;
      }
      
      // Continue without JWT authentication if not required
      next();
    }
  };
}

/**
 * Middleware to require specific roles
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isJWTAuthenticated || !req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'This endpoint requires JWT authentication',
      });
      return;
    }

    const userRole = req.user.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        message: `This endpoint requires one of the following roles: ${allowedRoles.join(', ')}`,
        currentRole: userRole || 'none',
        requiredRoles: allowedRoles,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to require specific permissions
 */
export function requirePermission(requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isJWTAuthenticated || !req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'This endpoint requires JWT authentication',
      });
      return;
    }

    const userPermissions = req.user.permissions || [];
    const hasAllPermissions = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      res.status(403).json({
        error: 'Insufficient permissions',
        message: `Missing required permissions: ${requiredPermissions.join(', ')}`,
        currentPermissions: userPermissions,
        requiredPermissions,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware for optional JWT authentication
 */
export function optionalJWT(secret: string, algorithms: Algorithm[] = ['HS256']) {
  return createJWTAuthMiddleware({
    secret,
    algorithms,
    required: false,
  });
}

/**
 * Middleware to require JWT authentication
 */
export function requireJWT(secret: string, algorithms: Algorithm[] = ['HS256']) {
  return createJWTAuthMiddleware({
    secret,
    algorithms,
    required: true,
  });
}
