const axios = require('axios');

async function testSingleEndpoint() {
  console.log('🧪 Testing Auth Endpoint Rate Limiting...\n');

  const results = [];
  
  // Make 12 requests to exceed the 10 request limit
  for (let i = 1; i <= 12; i++) {
    try {
      const response = await axios.post('http://localhost:3000/auth/login', {
        email: 'test@example.com',
        password: 'wrongpassword'
      }, {
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        },
        timeout: 3000
      });
      
      const remaining = response.headers['x-ratelimit-remaining'];
      const limit = response.headers['x-ratelimit-limit'];
      const status = response.status;
      
      results.push({
        request: i,
        status,
        remaining: parseInt(remaining),
        limit: parseInt(limit)
      });
      
      console.log(`Request ${i}: Status ${status}, Remaining: ${remaining}/${limit}`);
      
      if (status === 429) {
        console.log(`🚫 Successfully rate limited at request ${i}!`);
        break;
      }
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
    } catch (error) {
      console.error(`Request ${i} failed:`, error.code || error.message);
      break;
    }
  }

  // Analyze results
  const successfulRequests = results.filter(r => r.status !== 429).length;
  const rateLimitedRequests = results.filter(r => r.status === 429).length;
  
  console.log('\n📊 Results Summary:');
  console.log(`✅ Successful requests: ${successfulRequests}`);
  console.log(`🚫 Rate limited requests: ${rateLimitedRequests}`);
  console.log(`📈 Pattern: ${results.map(r => r.remaining).join(' → ')}`);
  
  if (rateLimitedRequests > 0) {
    console.log('\n🎉 Rate limiting is working correctly!');
    return true;
  } else if (successfulRequests === 10 && results[9].remaining === 0) {
    console.log('\n✅ Rate limiting is working - reached the exact limit!');
    return true;
  } else {
    console.log('\n❌ Rate limiting may not be working properly.');
    return false;
  }
}

testSingleEndpoint().catch(console.error);
