const axios = require('axios');

async function testAuthRateLimit() {
  console.log('Testing AUTH endpoint rate limiting (limit: 10 per 5 minutes)...\n');
  
  for (let i = 1; i <= 15; i++) {
    try {
      const response = await axios.post('http://localhost:3000/auth/login', {
        email: 'test@example.com',
        password: 'wrongpassword'
      }, {
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      });
      
      const remaining = response.headers['x-ratelimit-remaining'];
      const limit = response.headers['x-ratelimit-limit'];
      const status = response.status;
      
      console.log(`Request ${i}: Status ${status}, Remaining: ${remaining}/${limit}`);
      
      if (status === 429) {
        console.log(`🚫 Rate limited after ${i} requests!`);
        break;
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Request ${i} failed:`, error.message);
    }
  }
}

testAuthRateLimit();
