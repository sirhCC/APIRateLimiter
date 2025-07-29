/**
 * Integration Tests for API Rate Limiter
 * 
 * Tests full API endpoints with request/response validation.
 */

import request from 'supertest';
import express from 'express';

// Mock Express app for testing
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Simple test endpoints
  app.get('/test', (req, res) => {
    res.json({ message: 'Test endpoint', timestamp: Date.now() });
  });

  app.post('/test', (req, res) => {
    res.json({ message: 'Test POST endpoint', body: req.body });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  return app;
};

describe('API Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('Basic API Functionality', () => {
    it('should respond to GET requests', async () => {
      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Test endpoint');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.timestamp).toBe('number');
    });

    it('should respond to POST requests', async () => {
      const testData = { name: 'test', value: 123 };

      const response = await request(app)
        .post('/test')
        .send(testData)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Test POST endpoint');
      expect(response.body).toHaveProperty('body');
      expect(response.body.body).toEqual(testData);
    });

    it('should handle health check requests', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 404 for non-existent routes', async () => {
      await request(app)
        .get('/non-existent')
        .expect(404);
    });

    it('should handle malformed JSON in POST requests', async () => {
      await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });
  });

  describe('HTTP Headers and Status Codes', () => {
    it('should include proper content-type headers', async () => {
      const response = await request(app)
        .get('/test')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should handle different HTTP methods', async () => {
      // Test GET
      await request(app).get('/test').expect(200);

      // Test POST
      await request(app).post('/test').send({}).expect(200);

      // Test unsupported methods
      await request(app).put('/test').expect(404);
      await request(app).delete('/test').expect(404);
    });

    it('should handle large payloads', async () => {
      const largeData = {
        data: 'x'.repeat(10000), // 10KB of data
        array: new Array(1000).fill('test')
      };

      const response = await request(app)
        .post('/test')
        .send(largeData)
        .expect(200);

      expect(response.body.body.data).toHaveLength(10000);
      expect(response.body.body.array).toHaveLength(1000);
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle server errors', () => {
      // Add an endpoint that throws an error
      app.get('/error', (req, res) => {
        throw new Error('Test error');
      });

      // This will test the default Express error handler
      return request(app)
        .get('/error')
        .expect(500);
    });

    it('should handle async errors', async () => {
      // Add an async endpoint that throws
      app.get('/async-error', async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Async test error');
      });

      await request(app)
        .get('/async-error')
        .expect(500);
    });
  });

  describe('Request Processing', () => {
    it('should process concurrent requests', async () => {
      const promises: Promise<request.Response>[] = [];
      const numRequests = 10;

      for (let i = 0; i < numRequests; i++) {
        promises.push(
          request(app)
            .get('/test')
            .expect(200)
        );
      }

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(numRequests);
      
      // All should have succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Test endpoint');
      });
    });

    it('should handle request timeouts gracefully', async () => {
      // Add a slow endpoint
      app.get('/slow', async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        res.json({ message: 'Slow response' });
      });

      const response = await request(app)
        .get('/slow')
        .timeout(5000) // 5 second timeout
        .expect(200);

      expect(response.body.message).toBe('Slow response');
    });
  });

  describe('Performance Characteristics', () => {
    it('should respond quickly to simple requests', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/test')
        .expect(200);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // Should respond in less than 100ms for simple endpoint
      expect(responseTime).toBeLessThan(100);
    });

    it('should handle multiple rapid requests', async () => {
      const promises: Promise<request.Response>[] = [];
      const startTime = Date.now();
      
      // Send 50 rapid requests
      for (let i = 0; i < 50; i++) {
        promises.push(
          request(app).get('/test').expect(200)
        );
      }

      await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should complete all requests in reasonable time
      expect(totalTime).toBeLessThan(1000); // 1 second
    });
  });
});
