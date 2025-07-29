# ⚙️ Configuration Directory

This directory contains configuration files and examples for the API Rate Limiter.

## Files

- **.env.example** - Example environment configuration file

## Setup Instructions

1. Copy the example environment file:
   ```bash
   copy config\.env.example .env
   ```

2. Edit the `.env` file with your specific configuration values

3. Run the production setup script for automated configuration:
   ```bash
   npm run setup
   ```

## Environment Variables

Key configuration options:
- **JWT_SECRET** - Secret key for JWT token signing
- **REDIS_HOST** - Redis server hostname
- **REDIS_PORT** - Redis server port
- **REDIS_PASSWORD** - Redis authentication password
- **NODE_ENV** - Environment (development/production)
- **PORT** - Application server port

## Future Configuration

Planned configuration files:
- [ ] Redis cluster configuration
- [ ] Rate limiting rule definitions
- [ ] API tier definitions
- [ ] Monitoring configuration
- [ ] Security policy definitions
