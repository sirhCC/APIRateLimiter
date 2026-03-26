import { Request } from 'express';
import { ApiKeyMetadata } from '../utils/apiKeys';

export function parseApiKeyExpiry(expiresAt?: string): number | undefined {
  if (typeof expiresAt !== 'string') {
    return undefined;
  }

  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function buildApiKeyRequestMetadata(req: Request, metadata?: Record<string, unknown>) {
  return {
    ...metadata,
    userAgent: req.get('User-Agent'),
    ipAddress: req.ip,
  };
}

export function serializeApiKeyMetadata(metadata: ApiKeyMetadata) {
  return {
    id: metadata.id,
    name: metadata.name,
    tier: metadata.tier,
    userId: metadata.userId,
    organizationId: metadata.organizationId,
    createdAt: new Date(metadata.created).toISOString(),
    expiresAt: metadata.expiresAt ? new Date(metadata.expiresAt).toISOString() : undefined,
    isActive: metadata.isActive,
    revokedAt: metadata.revokedAt ? new Date(metadata.revokedAt).toISOString() : undefined,
    revokedBy: metadata.revokedBy,
    revocationReason: metadata.revocationReason,
    lastRotatedAt: metadata.lastRotatedAt ? new Date(metadata.lastRotatedAt).toISOString() : undefined,
    metadata: metadata.metadata,
  };
}
