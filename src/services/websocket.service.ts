import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

// Map of bookingId to set of connected WebSocket clients
const subscriptions = new Map<string, Set<WebSocket>>();

export const initWebSocketServer = (server: HTTPServer) => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WEBSOCKET] Client connected.');
    let subscribedBookingId: string | null = null;

    ws.on('message', (message: string) => {
      try {
        const payload = JSON.parse(message);
        console.log('[WEBSOCKET] Received payload:', payload);

        if (payload.type === 'SUBSCRIBE') {
          const bookingId = payload.bookingId;
          if (bookingId) {
            // Remove previous subscription if any
            if (subscribedBookingId && subscriptions.has(subscribedBookingId)) {
              subscriptions.get(subscribedBookingId)?.delete(ws);
            }

            subscribedBookingId = bookingId;
            if (!subscriptions.has(bookingId)) {
              subscriptions.set(bookingId, new Set());
            }
            subscriptions.get(bookingId)?.add(ws);
            console.log(`[WEBSOCKET] Client subscribed to booking: ${bookingId}`);

            // Send a confirmation acknowledgment
            ws.send(JSON.stringify({ type: 'SUBSCRIBED', bookingId }));
          }
        }
      } catch (err) {
        console.error('[WEBSOCKET] Error parsing message:', err);
      }
    });

    ws.on('close', () => {
      console.log('[WEBSOCKET] Client disconnected.');
      if (subscribedBookingId && subscriptions.has(subscribedBookingId)) {
        subscriptions.get(subscribedBookingId)?.delete(ws);
        if (subscriptions.get(subscribedBookingId)?.size === 0) {
          subscriptions.delete(subscribedBookingId);
        }
      }
    });
  });

  console.log('📡 [WEBSOCKET] Server initialized and attached to HTTP server');
};

export const broadcastBookingUpdate = (bookingId: string, bookingData: any) => {
  const clients = subscriptions.get(bookingId);
  if (clients && clients.size > 0) {
    console.log(`[WEBSOCKET] Broadcasting update to ${clients.size} clients for booking: ${bookingId}`);
    const payload = JSON.stringify({
      type: 'BOOKING_UPDATE',
      bookingId,
      data: bookingData,
    });
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  } else {
    console.log(`[WEBSOCKET] No active WebSocket clients subscribed to booking: ${bookingId}`);
  }
};
