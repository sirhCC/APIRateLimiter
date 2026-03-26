import jwt from 'jsonwebtoken';
import { ERROR_CODES } from '../utils/errorCodes';

export interface DemoUserRecord {
  id: string;
  role: 'admin' | 'premium' | 'user' | 'guest';
  tier: 'enterprise' | 'premium' | 'free';
}

export interface DemoAuthSuccess {
  ok: true;
  user: DemoUserRecord;
}

export interface DemoAuthFailure {
  ok: false;
  status: number;
  error: string;
  message: string;
  code: string;
}

export type DemoAuthResult = DemoAuthSuccess | DemoAuthFailure;

export const DEMO_USERS: Record<string, DemoUserRecord> = {
  'admin@example.com': { id: 'admin-1', role: 'admin', tier: 'enterprise' },
  'premium@example.com': { id: 'premium-1', role: 'premium', tier: 'premium' },
  'user@example.com': { id: 'user-1', role: 'user', tier: 'free' },
  'guest@example.com': { id: 'guest-1', role: 'guest', tier: 'free' },
};

export function authenticateDemoUser(email: string, password: string, demoUsersEnabled: boolean): DemoAuthResult {
  if (!demoUsersEnabled) {
    return {
      ok: false,
      status: 503,
      error: 'Demo authentication disabled',
      message: 'Demo users are disabled. Please configure your own authentication system.',
      code: ERROR_CODES.AUTH.DEMO_DISABLED,
    };
  }

  const user = DEMO_USERS[email];
  if (!user || password !== 'demo123') {
    return {
      ok: false,
      status: 401,
      error: 'Invalid credentials',
      message: 'Use one of the demo accounts: admin@example.com, premium@example.com, user@example.com, guest@example.com with password: demo123',
      code: ERROR_CODES.AUTH.INVALID_CREDENTIALS,
    };
  }

  return {
    ok: true,
    user,
  };
}

export function signDemoJwtToken(secret: string, email: string, user: DemoUserRecord): string {
  return jwt.sign(
    {
      id: user.id,
      email,
      role: user.role,
      tier: user.tier,
      permissions: user.role === 'admin' ? ['read', 'write', 'admin'] : ['read'],
    },
    secret,
    {
      expiresIn: '24h',
      algorithm: 'HS256',
    }
  );
}

export function buildDemoLoginResponse(email: string, user: DemoUserRecord, token: string) {
  return {
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      email,
      role: user.role,
      tier: user.tier,
    },
    expiresIn: '24h',
  };
}
