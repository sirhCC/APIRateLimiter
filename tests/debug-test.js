const axios = require('axios');

async function testAuthEndpoint() {
  try {
    console.log('Making request to auth endpoint...');
    const response = await axios.post('http://localhost:3000/auth/login', {
      email: 'test@example.com',
      password: 'wrongpassword'
    }, {
      validateStatus: function (status) {
        return status >= 200 && status < 500; // Accept any valid HTTP status
      }
    });
    
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('Response:', response.data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAuthEndpoint();
