import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

// Map of bookingId to set of connected WebSocket clients
const bookingSubscriptions = new Map<string, Set<WebSocket>>();

// Map of userId to set of connected WebSocket clients
const userSubscriptions = new Map<string, Set<WebSocket>>();

// Set of all connected WebSocket clients
const allClients = new Set<WebSocket>();

export const initWebSocketServer = (server: HTTPServer) => {
  const wss = new WebSocketServer({ server });

  // Heartbeat ping interval to prevent Nginx / AWS ALB / Mobile Carrier idle timeouts (30s)
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        console.log('[WEBSOCKET] Terminating inactive client due to missed heartbeat.');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws: any) => {
    console.log('[WEBSOCKET] Client connected.');
    ws.isAlive = true;
    allClients.add(ws);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    let subscribedUserId: string | null = null;
    const subscribedBookingIds = new Set<string>();

    ws.on('message', (message: string) => {
      try {
        const payload = JSON.parse(message);
        console.log('[WEBSOCKET] Received payload:', payload);

        if (payload.type === 'SUBSCRIBE_USER') {
          const userId = payload.userId;
          if (userId) {
            if (subscribedUserId && userSubscriptions.has(subscribedUserId)) {
              userSubscriptions.get(subscribedUserId)?.delete(ws);
            }
            subscribedUserId = userId;
            if (!userSubscriptions.has(userId)) {
              userSubscriptions.set(userId, new Set());
            }
            userSubscriptions.get(userId)?.add(ws);
            console.log(`[WEBSOCKET] Client registered for user channel: ${userId}`);
            ws.send(JSON.stringify({ type: 'SUBSCRIBED_USER', userId }));
          }
        } else if (payload.type === 'SUBSCRIBE') {
          const bookingId = payload.bookingId;
          if (bookingId) {
            subscribedBookingIds.add(bookingId);
            if (!bookingSubscriptions.has(bookingId)) {
              bookingSubscriptions.set(bookingId, new Set());
            }
            bookingSubscriptions.get(bookingId)?.add(ws);
            console.log(`[WEBSOCKET] Client subscribed to booking channel: ${bookingId}`);
            ws.send(JSON.stringify({ type: 'SUBSCRIBED', bookingId }));
          }
        } else if (payload.type === 'UNSUBSCRIBE') {
          const bookingId = payload.bookingId;
          if (bookingId && bookingSubscriptions.has(bookingId)) {
            bookingSubscriptions.get(bookingId)?.delete(ws);
            subscribedBookingIds.delete(bookingId);
            console.log(`[WEBSOCKET] Client unsubscribed from booking channel: ${bookingId}`);
          }
        }
      } catch (err) {
        console.error('[WEBSOCKET] Error parsing message:', err);
      }
    });

    ws.on('close', () => {
      console.log('[WEBSOCKET] Client disconnected.');
      allClients.delete(ws);

      if (subscribedUserId && userSubscriptions.has(subscribedUserId)) {
        userSubscriptions.get(subscribedUserId)?.delete(ws);
        if (userSubscriptions.get(subscribedUserId)?.size === 0) {
          userSubscriptions.delete(subscribedUserId);
        }
      }

      subscribedBookingIds.forEach((bId) => {
        if (bookingSubscriptions.has(bId)) {
          bookingSubscriptions.get(bId)?.delete(ws);
          if (bookingSubscriptions.get(bId)?.size === 0) {
            bookingSubscriptions.delete(bId);
          }
        }
      });
    });
  });

  console.log('📡 [WEBSOCKET] Server initialized with Ping/Pong Heartbeat and attached to HTTP server');
};

/**
 * Broadcast a newly created booking to targeted Service Providers (within 7km and matching service category).
 */
export const broadcastNewBooking = (bookingData: any, targetUserIds?: string[]) => {
  const payload = JSON.stringify({
    type: 'NEW_BOOKING',
    data: bookingData,
  });

  if (targetUserIds && targetUserIds.length > 0) {
    console.log(`[WEBSOCKET] Broadcasting NEW_BOOKING to ${targetUserIds.length} targeted matching SP users.`);
    targetUserIds.forEach((userId) => {
      const userSockets = userSubscriptions.get(userId);
      if (userSockets) {
        userSockets.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
      }
    });
  } else if (targetUserIds === undefined) {
    // Fallback broadcast to all connected clients if no target filter specified
    console.log(`[WEBSOCKET] Broadcasting NEW_BOOKING to all ${allClients.size} connected clients.`);
    allClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  } else {
    console.log(`[WEBSOCKET] No matching target SP users connected for NEW_BOOKING broadcast.`);
  }
};

/**
 * Broadcast a REMOVE_BROADCAST event when a job is accepted, cancelled, or timed out.
 */
export const broadcastRemoveBroadcast = (bookingId: string) => {
  const payload = JSON.stringify({
    type: 'REMOVE_BROADCAST',
    bookingId,
  });

  console.log(`[WEBSOCKET] Broadcasting REMOVE_BROADCAST for booking: ${bookingId}`);
  allClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

/**
 * Broadcast an updated booking to all subscribed clients (booking channel + user channels).
 */
export const broadcastBookingUpdate = (bookingId: string, bookingData: any) => {
  const payload = JSON.stringify({
    type: 'BOOKING_UPDATE',
    bookingId,
    data: bookingData,
  });

  const targets = new Set<WebSocket>();

  // Add all booking channel subscribers
  const bookingSubscribers = bookingSubscriptions.get(bookingId);
  if (bookingSubscribers) {
    bookingSubscribers.forEach((ws) => targets.add(ws));
  }

  // Add customer user socket if connected
  const customerId = bookingData.customerId;
  if (customerId && userSubscriptions.has(customerId)) {
    userSubscriptions.get(customerId)?.forEach((ws) => targets.add(ws));
  }

  // Add SP user socket if connected
  const spId = bookingData.spId;
  if (spId && userSubscriptions.has(spId)) {
    userSubscriptions.get(spId)?.forEach((ws) => targets.add(ws));
  }

  if (targets.size > 0) {
    console.log(`[WEBSOCKET] Broadcasting BOOKING_UPDATE to ${targets.size} clients for booking: ${bookingId}`);
    targets.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  } else {
    console.log(`[WEBSOCKET] No active subscribers for booking update: ${bookingId}`);
  }
};
