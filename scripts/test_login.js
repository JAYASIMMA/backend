const axios = require('axios');

async function testLogin() {
  try {
    const response = await axios.post('http://localhost:3000/api/v1/auth/login', {
      mobile: '9884633223',
      password: 'wrongpassword' // Just to see if it hits the controller
    });
    console.log('Response:', response.data);
  } catch (e) {
    if (e.response) {
      console.log('Status Code:', e.response.status);
      console.log('Error Data:', e.response.data);
    } else {
      console.error('Error:', e.message);
    }
  }
}

testLogin();
