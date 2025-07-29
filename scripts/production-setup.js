#!/usr/bin/env node

/**
 * Production Environment Setup Script
 * 
 * This script helps set up the API Rate Limiter for production deployment
 * by checking configuration and providing security recommendations.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🚀 API Rate Limiter - Production Setup\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('❌ .env file not found');
  
  if (fs.existsSync(envExamplePath)) {
    console.log('📋 Creating .env from .env.example...');
    
    // Read .env.example
    let envContent = fs.readFileSync(envExamplePath, 'utf8');
    
    // Generate secure JWT secret
    const jwtSecret = crypto.randomBytes(32).toString('hex');
    envContent = envContent.replace(
      'JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars',
      `JWT_SECRET=${jwtSecret}`
    );
    
    // Set production defaults
    envContent = envContent.replace('NODE_ENV=development', 'NODE_ENV=production');
    envContent = envContent.replace('REDIS_ENABLED=false', 'REDIS_ENABLED=true');
    
    // Write .env file
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env file created with secure JWT secret');
  } else {
    console.log('❌ .env.example not found - cannot create .env file');
    process.exit(1);
  }
} else {
  console.log('✅ .env file exists');
}

// Load and validate environment
require('dotenv').config();

console.log('\n🔒 Security Check:');

// Check JWT secret
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.includes('your-super-secret') || jwtSecret.length < 32) {
  console.log('❌ JWT_SECRET is not secure - please generate a new one');
  console.log(`   Suggested: ${crypto.randomBytes(32).toString('hex')}`);
} else {
  console.log('✅ JWT_SECRET is secure');
}

// Check Redis configuration
if (process.env.REDIS_ENABLED === 'true') {
  console.log('✅ Redis is enabled');
} else {
  console.log('⚠️  Redis is disabled - limited functionality');
}

// Check production settings
if (process.env.NODE_ENV === 'production') {
  console.log('✅ NODE_ENV is set to production');
  
  if (process.env.DEMO_USERS_ENABLED === 'true') {
    console.log('⚠️  Demo users are enabled in production');
  }
  
  if (process.env.CORS_ORIGIN === '*') {
    console.log('⚠️  CORS allows all origins');
  }
} else {
  console.log('⚠️  NODE_ENV is not set to production');
}

console.log('\n📋 Production Checklist:');
console.log('[ ] Set up HTTPS/TLS certificate');
console.log('[ ] Configure Redis server with authentication');
console.log('[ ] Set up reverse proxy (nginx/Apache)');
console.log('[ ] Configure monitoring and logging');
console.log('[ ] Set up database for user management');
console.log('[ ] Configure CORS for specific domains');
console.log('[ ] Set up automated backups');
console.log('[ ] Configure rate limiting rules for your use case');

console.log('\n🏁 Setup complete! Run "npm start" to start the production server.');
