#!/usr/bin/env node

/**
 * Security Management CLI Tool
 * Provides commands for managing secrets and security configuration
 */

// Load environment variables first
require('dotenv').config();

const { SecretManager } = require('../dist/utils/secretManager');
const { existsSync, copyFileSync } = require('fs');
const { join } = require('path');
const path = require('path');

const commands = {
  audit: auditSecurity,
  generate: generateSecrets,
  fix: fixSecurityIssues,
  validate: validateSecret,
  help: showHelp,
};

function main() {
  const command = process.argv[2];
  
  if (!command || !commands[command]) {
    showHelp();
    return;
  }
  
  commands[command]();
}

function auditSecurity() {
  console.log('🔍 Auditing security configuration...\n');
  
  const audit = SecretManager.auditEnvironment();
  
  if (audit.secure) {
    console.log('✅ Security audit passed - no critical issues found!');
  } else {
    console.log('❌ Security audit found issues:\n');
    
    audit.issues.forEach(issue => {
      const icon = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🔵',
      }[issue.severity];
      
      console.log(`${icon} ${issue.severity.toUpperCase()}: ${issue.variable}`);
      console.log(`   ${issue.issue}\n`);
    });
    
    const criticalCount = audit.issues.filter(i => i.severity === 'critical').length;
    const highCount = audit.issues.filter(i => i.severity === 'high').length;
    
    console.log(`Summary: ${criticalCount} critical, ${highCount} high priority issues`);
    console.log('\nRun "npm run security:fix" to automatically fix these issues.');
  }
}

function generateSecrets() {
  console.log('🔐 Generating new secure secrets...\n');
  
  const secrets = SecretManager.generateSecrets();
  
  console.log('Generated secrets:');
  console.log(`JWT Secret: ${secrets.jwtSecret.substring(0, 16)}... (64 chars)`);
  console.log(`API Key Secret: ${secrets.apiKeySecret.substring(0, 16)}... (32 chars)`);
  console.log(`Session Secret: ${secrets.sessionSecret.substring(0, 16)}... (32 chars)`);
  console.log(`Encryption Key: ${secrets.encryptionKey.substring(0, 16)}... (32 chars)`);
  
  console.log('\n⚠️  Store these secrets securely and update your .env file');
  console.log('Run "npm run security:fix" to automatically update your environment file');
}

function fixSecurityIssues() {
  console.log('🔧 Fixing security issues...\n');
  
  const configDir = path.join(process.cwd(), 'config');
  const templatePath = path.join(configDir, '.env.example');
  const envPath = path.join(process.cwd(), '.env');
  
  if (!existsSync(templatePath)) {
    console.error('❌ Template file not found:', templatePath);
    return;
  }
  
  // Backup existing .env if it exists
  if (existsSync(envPath)) {
    const backupPath = `${envPath}.backup.${Date.now()}`;
    copyFileSync(envPath, backupPath);
    console.log(`📋 Backed up existing .env to: ${backupPath}`);
  }
  
  try {
    // Generate secure environment file
    SecretManager.generateSecureEnvFile(templatePath, envPath, {
      'REDIS_ENABLED': 'true',
      'NODE_ENV': 'development',
    });
    
    console.log('✅ Generated secure .env file with new secrets');
    console.log('\n🔒 Security improvements applied:');
    console.log('   ✅ Generated cryptographically secure JWT secret');
    console.log('   ✅ Added API key encryption secret');
    console.log('   ✅ Added session management secret');
    console.log('   ✅ Added data encryption key');
    console.log('   ✅ Added security metadata');
    
    console.log('\n⚠️  Important: Review the generated .env file before starting the application');
    console.log('⚠️  Make sure to add .env to .gitignore to prevent committing secrets');
    
    console.log('\n✅ Security fixes applied successfully!');
    console.log('🔄  Run "npm run security:audit" to verify the fixes');
    
  } catch (error) {
    console.error('❌ Failed to fix security issues:', error.message);
  }
}

function validateSecret() {
  const secret = process.argv[3];
  
  if (!secret) {
    console.error('❌ Please provide a secret to validate');
    console.log('Usage: npm run security:validate <secret>');
    return;
  }
  
  console.log('🔍 Validating secret...\n');
  
  const validation = SecretManager.validateSecret(secret);
  
  console.log(`Strength: ${validation.strength.toUpperCase()}`);
  console.log(`Valid: ${validation.isValid ? '✅ Yes' : '❌ No'}`);
  
  if (validation.issues.length > 0) {
    console.log('\nIssues found:');
    validation.issues.forEach(issue => {
      console.log(`  ❌ ${issue}`);
    });
  } else {
    console.log('\n✅ Secret passes all security checks');
  }
  
  console.log('\nRecommendations:');
  console.log('  • Use at least 64 characters for maximum security');
  console.log('  • Include mixed case letters, numbers, and symbols');
  console.log('  • Generate secrets using: npm run security:generate');
}

function showHelp() {
  console.log('🔒 Security Management CLI\n');
  console.log('Available commands:');
  console.log('  audit     - Audit current security configuration');
  console.log('  generate  - Generate new secure secrets');
  console.log('  fix       - Fix security issues automatically');
  console.log('  validate  - Validate a secret string');
  console.log('  help      - Show this help message');
  console.log('\nExamples:');
  console.log('  npm run security:audit');
  console.log('  npm run security:fix');
  console.log('  npm run security:validate "my-secret-key"');
}

if (require.main === module) {
  main();
}

module.exports = { main, commands };
