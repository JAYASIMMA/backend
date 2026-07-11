import dotenv from 'dotenv';
dotenv.config();
import os from 'os';
import app from './app';
import { startTimeoutChecker } from './services/timeout.service';
import { initWebSocketServer } from './services/websocket.service';

const PORT = process.env.PORT || 3000;

const getLocalIps = () => {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(`${iface.address} (${name})`);
      }
    }
  }
  return ips.length > 0 ? ips : ['localhost'];
};

const server = app.listen(Number(PORT), '0.0.0.0', () => {
  startTimeoutChecker();
  const localIps = getLocalIps();
  console.log(`\n🚀 [BACKEND] Server running on port ${PORT}`);
  console.log(`📡 Listening on: 0.0.0.0 (All interfaces)`);
  console.log(`🌍 External URLs for Mobile:`);
  localIps.forEach(ip => console.log(`   👉 http://${ip.split(' ')[0]}:${PORT}/api/v1`));
  console.log(`\n🔗 Production URL: https://api.specialnest.in/api/v1`);
  console.log(`🛠️  Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

initWebSocketServer(server);
