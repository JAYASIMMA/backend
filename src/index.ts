import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT || 5000;

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Listening on all interfaces (0.0.0.0) — reachable from mobile devices`);
  console.log(`Mobile URL: http://10.211.92.200:${PORT}/api/v1`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
