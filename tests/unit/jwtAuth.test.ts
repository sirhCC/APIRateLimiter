/**
 * JWT Authentication Middleware Tests
 * 
 * Tests for JWT-based authentication middleware including:
 * - JWT token validation
 * - Role-based access control
 * - Permission-based access control
 * - Token extraction from various sources
 * - Security validation
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { 
  createJWTAuthMiddleware,
  requireRole,
  requirePermission,
  optionalJWT,
  requireJWT,
  JWTUserData,
  JWTAuthOptions
} from '../../src/middleware/jwtAuth';

// Mock jwt library
jest.mock('jsonwebtoken');
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('JWT Authentication Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    mockReq = {
      headers: {},
      query: {},
      cookies: {},
      user: undefined
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      locals: {}
    };
    
    mockNext = jest.fn();
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Set up default environment
    process.env.JWT_SECRET = 'test-secret-key';
  });

  describe('JWT Middleware Creation', () => {
    it('should create JWT middleware with default options', () => {
      const options: JWTAuthOptions = {
        secret: 'test-secret'
      };

      const middleware = createJWTAuthMiddleware(options);

      expect(typeof middleware).toBe('function');
    });

    it('should create JWT middleware with custom options', () => {
      const options: JWTAuthOptions = {
        secret: 'test-secret',
        required: true,
        headerName: 'x-auth-token',
        cookieName: 'auth_token',
        queryParamName: 'auth',
        algorithms: ['HS256', 'RS256']
      };

      const middleware = createJWTAuthMiddleware(options);

      expect(typeof middleware).toBe('function');
    });
  });

  describe('Token Extraction', () => {
    it('should extract JWT from Authorization header', async () => {
      mockReq.headers = {
        authorization: 'Bearer valid-jwt-token'
      };

      const mockPayload: JWTUserData = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        tier: 'free'
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const middleware = createJWTAuthMiddleware({
        secret: 'test-secret',
        required: true
      });
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockJwt.verify).toHaveBeenCalledWith('valid-jwt-token', 'test-secret', {
        algorithms: ['HS256']
      });
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual(mockPayload);
    });

    it('should extract JWT from cookies', async () => {
      mockReq.cookies = {
        jwt_token: 'cookie-jwt-token'
      };

      const mockPayload: JWTUserData = {
        id: 'user-456',
        email: 'cookie@example.com',
        role: 'premium'
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const middleware = createJWTAuthMiddleware({
        secret: 'test-secret',
        required: true
      });
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockJwt.verify).toHaveBeenCalledWith('cookie-jwt-token', 'test-secret', {
        algorithms: ['HS256']
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract JWT from query parameter', async () => {
      mockReq.query = {
        token: 'query-jwt-token'
      };

      const mockPayload: JWTUserData = {
        id: 'user-789',
        email: 'query@example.com',
        role: 'admin'
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const middleware = createJWTAuthMiddleware({
        secret: 'test-secret',
        required: true
      });
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockJwt.verify).toHaveBeenCalledWith('query-jwt-token', 'test-secret', {
        algorithms: ['HS256']
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should prefer Authorization header over other sources', async () => {
      mockReq.headers = {
        authorization: 'Bearer header-token'
      };
      mockReq.cookies = {
        jwt_token: 'cookie-token'
      };
      mockReq.query = {
        token: 'query-token'
      };

      const mockPayload: JWTUserData = {
        id: 'user-priority',
        email: 'priority@example.com'
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const middleware = createJWTAuthMiddleware({
        secret: 'test-secret',
        required: true
      });
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockJwt.verify).toHaveBeenCalledWith('header-token', 'test-secret', {
        algorithms: ['HS256']
      });
    });
  });

  describe('JWT Validation', () => {
    it('should accept valid JWT tokens', async () => {
      mockReq.headers = {
        authorization: 'Bearer valid-token'
      };

      const mockPayload: JWTUserData = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        tier: 'free'
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const middleware = createJWTAuthMiddleware({
        secret: 'test-secret',
        required: true
      });
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual(mockPayload);
      expect(mockReq.isJWTAuthenticated).toBe(true);
    });

    it('should reject invalid JWT tokens when required', async () => {
      mockReq.headers = {
        authorization: 'Bearer invalid-token'
      };

      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const middleware = createJWTAuthMiddleware({
        secret: 'test-secret',
        required: true
      });
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should continue without JWT when not required', async () => {
      const middleware = createJWTAuthMiddleware({
        secret: 'test-secret',
        required: false
      });
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeUndefined();
      // Note: isJWTAuthenticated may not be set when not required
    });

    it('should handle expired tokens', async () => {
      mockReq.headers = {
        authorization: 'Bearer expired-token'
      };

      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        const error = new Error('Token expired') as any;
        error.name = 'TokenExpiredError';
        throw error;
      });

      const middleware = createJWTAuthMiddleware({
        secret: 'test-secret',
        required: true
      });
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token'
        })
      );
    });
  });

  describe('Custom Handlers', () => {
    it('should call custom onTokenValidated handler', async () => {
      const onTokenValidated = jest.fn();
      
      mockReq.headers = {
        authorization: 'Bearer valid-token'
      };

      const mockPayload: JWTUserData = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user'
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const middleware = createJWTAuthMiddleware({
        secret: 'test-secret',
        required: true,
        onTokenValidated
      });
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(onTokenValidated).toHaveBeenCalledWith(mockReq, mockPayload);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call custom onTokenInvalid handler', async () => {
      const onTokenInvalid = jest.fn();
      
      mockReq.headers = {
        authorization: 'Bearer invalid-token'
      };

      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const middleware = createJWTAuthMiddleware({
        secret: 'test-secret',
        required: true,
        onTokenInvalid
      });
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(onTokenInvalid).toHaveBeenCalledWith(
        mockReq,
        mockRes,
        expect.any(Error)
      );
    });
  });

  describe('Role-Based Access Control', () => {
    beforeEach(() => {
      mockReq.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        tier: 'free'
      };
      mockReq.isJWTAuthenticated = true; // Important: set authentication flag
    });

    it('should allow access for users with correct role', async () => {
      const middleware = requireRole(['user', 'admin']);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access for users with incorrect role', async () => {
      mockReq.user!.role = 'guest';

      const middleware = requireRole(['admin']);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Insufficient permissions'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle missing user object', async () => {
      mockReq.user = undefined;
      mockReq.isJWTAuthenticated = false;

      const middleware = requireRole(['user']);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Permission-Based Access Control', () => {
    beforeEach(() => {
      mockReq.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        permissions: ['read:data', 'write:data']
      };
      mockReq.isJWTAuthenticated = true; // Important: set authentication flag
    });

    it('should allow access for users with correct permissions', async () => {
      const middleware = requirePermission(['read:data']);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access for users without required permissions', async () => {
      const middleware = requirePermission(['admin:delete']);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle missing permissions array', async () => {
      mockReq.user!.permissions = undefined;

      const middleware = requirePermission(['read:data']);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Convenience Functions', () => {
    it('should create optional JWT middleware', async () => {
      const middleware = optionalJWT('test-secret');

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should create required JWT middleware', async () => {
      const middleware = requireJWT('test-secret');

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should work with custom algorithms', async () => {
      mockReq.headers = {
        authorization: 'Bearer valid-token'
      };

      const mockPayload: JWTUserData = {
        id: 'user-123',
        email: 'test@example.com'
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const middleware = requireJWT('test-secret', ['RS256']);

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockJwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret', {
        algorithms: ['RS256']
      });
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
