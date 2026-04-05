import dotenv from 'dotenv';
dotenv.config();
import os from 'os';
import app from './app';

const PORT = process.env.PORT || 3000;

const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

app.listen(Number(PORT), '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`Server running on port ${PORT}`);
  console.log(`Listening on all interfaces (0.0.0.0) — reachable from mobile devices`);
  console.log(`Production URL: https://api.specialnest.in/api/v1`);
  console.log(`Mobile Connectivity (Internal): http://${localIp}:${PORT}/api/v1`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
