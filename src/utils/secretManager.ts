import { randomBytes, createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Secure Secret Management Utility
 * Handles generation, validation, and storage of cryptographic secrets
 */
export class SecretManager {
  private static readonly MIN_SECRET_LENGTH = 32;
  private static readonly WEAK_SECRETS = [
    'your-super-secret-jwt-key-change-in-production',
    'change-me',
    'secret',
    'password',
    'jwt-secret',
    'default',
  ];

  /**
   * Generate a cryptographically secure random secret
   */
  static generateSecureSecret(length: number = 64): string {
    // For better entropy, mix hex with base64 characters
    const bytes = randomBytes(Math.ceil(length * 0.75));
    let secret = bytes.toString('base64').replace(/[/+=]/g, '');
    
    // Ensure we have enough length
    while (secret.length < length) {
      const moreBytes = randomBytes(16);
      secret += moreBytes.toString('hex');
    }
    
    return secret.substring(0, length);
  }

  /**
   * Generate multiple secrets for different purposes
   */
  static generateSecrets(): {
    jwtSecret: string;
    apiKeySecret: string;
    sessionSecret: string;
    encryptionKey: string;
  } {
    return {
      jwtSecret: this.generateSecureSecret(64),
      apiKeySecret: this.generateSecureSecret(32),
      sessionSecret: this.generateSecureSecret(32),
      encryptionKey: this.generateSecureSecret(32),
    };
  }

  /**
   * Validate if a secret is secure
   */
  static validateSecret(secret: string): {
    isValid: boolean;
    issues: string[];
    strength: 'weak' | 'medium' | 'strong';
  } {
    const issues: string[] = [];
    
    // Check minimum length
    if (secret.length < this.MIN_SECRET_LENGTH) {
      issues.push(`Secret must be at least ${this.MIN_SECRET_LENGTH} characters long`);
    }

    // Check for weak/default secrets
    const lowerSecret = secret.toLowerCase();
    for (const weakSecret of this.WEAK_SECRETS) {
      if (lowerSecret.includes(weakSecret)) {
        issues.push('Secret contains weak or default values');
        break;
      }
    }

    // Check for common patterns
    if (/^[a-z]+$/i.test(secret)) {
      issues.push('Secret should contain mixed characters (not just letters)');
    }
    
    if (/^\d+$/.test(secret)) {
      issues.push('Secret should not be just numbers');
    }

    // Check entropy (basic)
    const uniqueChars = new Set(secret).size;
    const entropy = uniqueChars / secret.length;
    
    // Adjust entropy threshold based on character set
    const isHexString = /^[0-9a-fA-F]+$/.test(secret);
    const isBase64Like = /^[A-Za-z0-9]+$/.test(secret);
    
    let entropyThreshold = 0.3;
    if (isHexString) {
      entropyThreshold = 0.25; // 16 possible chars
    } else if (isBase64Like) {
      entropyThreshold = 0.4; // 62 possible chars
    }
    
    if (entropy < entropyThreshold) {
      issues.push('Secret has low entropy (too repetitive)');
    }

    // Determine strength
    let strength: 'weak' | 'medium' | 'strong' = 'weak';
    if (issues.length === 0) {
      const isHexString = /^[0-9a-fA-F]+$/.test(secret);
      const isBase64Like = /^[A-Za-z0-9]+$/.test(secret);
      
      if (secret.length >= 64) {
        if (isHexString && entropy > 0.3) {
          strength = 'strong';
        } else if (isBase64Like && entropy > 0.5) {
          strength = 'strong';
        } else if (entropy > 0.6) {
          strength = 'strong';
        }
      } else if (secret.length >= 32) {
        if (isHexString && entropy > 0.25) {
          strength = 'medium';
        } else if (isBase64Like && entropy > 0.4) {
          strength = 'medium';
        } else if (entropy > 0.5) {
          strength = 'medium';
        }
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      strength,
    };
  }

  /**
   * Hash a secret for safe storage/comparison
   */
  static hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /**
   * Generate a secure environment file with proper secrets
   */
  static generateSecureEnvFile(
    templatePath: string,
    outputPath: string,
    additionalVars: Record<string, string> = {}
  ): void {
    if (!existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    let envContent = readFileSync(templatePath, 'utf-8');
    const secrets = this.generateSecrets();

    // Replace insecure JWT secret
    envContent = envContent.replace(
      /JWT_SECRET=.*/,
      `JWT_SECRET=${secrets.jwtSecret}`
    );

    // Add new secure secrets
    envContent += '\n\n# Automatically Generated Secure Secrets\n';
    envContent += `API_KEY_SECRET=${secrets.apiKeySecret}\n`;
    envContent += `SESSION_SECRET=${secrets.sessionSecret}\n`;
    envContent += `ENCRYPTION_KEY=${secrets.encryptionKey}\n`;

    // Add any additional variables
    for (const [key, value] of Object.entries(additionalVars)) {
      envContent += `${key}=${value}\n`;
    }

    // Add security metadata
    envContent += `\n# Security Metadata\n`;
    envContent += `SECRETS_GENERATED_AT=${new Date().toISOString()}\n`;
    envContent += `SECRETS_VERSION=1.0.0\n`;

    writeFileSync(outputPath, envContent, 'utf-8');
  }

  /**
   * Audit current environment for security issues
   */
  static auditEnvironment(): {
    secure: boolean;
    issues: Array<{
      variable: string;
      issue: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
    }>;
  } {
    const issues: Array<{
      variable: string;
      issue: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
    }> = [];

    // Check JWT secret
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      issues.push({
        variable: 'JWT_SECRET',
        issue: 'JWT_SECRET is not set',
        severity: 'critical',
      });
    } else {
      const validation = this.validateSecret(jwtSecret);
      if (!validation.isValid) {
        issues.push({
          variable: 'JWT_SECRET',
          issue: `JWT_SECRET is insecure: ${validation.issues.join(', ')}`,
          severity: validation.strength === 'weak' ? 'critical' : 'high',
        });
      }
    }

    // Check Redis password
    const redisPassword = process.env.REDIS_PASSWORD;
    if (!redisPassword && process.env.REDIS_ENABLED === 'true') {
      issues.push({
        variable: 'REDIS_PASSWORD',
        issue: 'Redis is enabled but no password is set',
        severity: 'high',
      });
    }

    // Check if running in production with default values
    if (process.env.NODE_ENV === 'production') {
      const corsOrigin = process.env.CORS_ORIGIN;
      if (corsOrigin === '*') {
        issues.push({
          variable: 'CORS_ORIGIN',
          issue: 'CORS allows all origins in production',
          severity: 'high',
        });
      }
    }

    return {
      secure: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      issues,
    };
  }
}

/**
 * Startup security validation
 */
export function validateSecurityOnStartup(): void {
  console.log('🔒 Running security validation...');
  
  const audit = SecretManager.auditEnvironment();
  
  if (!audit.secure) {
    console.error('❌ Security validation failed:');
    audit.issues.forEach(issue => {
      const icon = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🔵',
      }[issue.severity];
      
      console.error(`   ${icon} ${issue.variable}: ${issue.issue}`);
    });
    
    const criticalIssues = audit.issues.filter(i => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      console.error('\n💥 Critical security issues found. Application cannot start.');
      console.error('Run "npm run security:fix" to automatically fix these issues.');
      process.exit(1);
    }
  } else {
    console.log('✅ Security validation passed');
  }
}
