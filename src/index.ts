import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT || 3000;

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Listening on all interfaces (0.0.0.0) — reachable from mobile devices`);
  console.log(`Production URL: https://api.specialnest.in/api/v1`);
  console.log(`Mobile Connectivity (Internal): http://10.27.189.199:${PORT}/api/v1`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
