# 🧪 Tests Directory

This directory contains all test files for the API Rate Limiter project.

## Test Files

- **test-setup.js** - Basic setup and configuration testing
- **test-api-keys.js** - API key management system tests
- **test-jwt-simple.js** - Simple JWT authentication tests
- **test-jwt-comprehensive.js** - Comprehensive JWT testing
- **test-jwt-rate-limits.js** - JWT-based rate limiting tests

## Running Tests

```bash
# Make sure the server is running first
npm run dev

# Then run tests in another terminal
npm test
```

## Test Coverage

Currently testing:
- ✅ Server startup and health checks
- ✅ API key generation and validation
- ✅ JWT authentication flows
- ✅ Rate limiting algorithms
- ✅ Dashboard functionality

## Future Test Plans

- [ ] Unit tests with Jest
- [ ] Integration tests
- [ ] Load testing with k6/Artillery
- [ ] Chaos engineering tests
- [ ] Performance regression tests
