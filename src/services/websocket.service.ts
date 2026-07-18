import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

// Map of bookingId to set of connected WebSocket clients
const subscriptions = new Map<string, Set<WebSocket>>();

// Map of userId to set of connected WebSocket clients — lets us push events
// (new booking opportunities, opportunity removal) straight to a specific
// user without them needing to know a bookingId in advance.
const userSubscriptions = new Map<string, Set<WebSocket>>();

export const initWebSocketServer = (server: HTTPServer) => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WEBSOCKET] Client connected.');
    let subscribedBookingId: string | null = null;
    let subscribedUserId: string | null = null;

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
        } else if (payload.type === 'SUBSCRIBE_USER') {
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
            console.log(`[WEBSOCKET] Client subscribed to user channel: ${userId}`);

            ws.send(JSON.stringify({ type: 'SUBSCRIBED_USER', userId }));
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
      if (subscribedUserId && userSubscriptions.has(subscribedUserId)) {
        userSubscriptions.get(subscribedUserId)?.delete(ws);
        if (userSubscriptions.get(subscribedUserId)?.size === 0) {
          userSubscriptions.delete(subscribedUserId);
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

/** Push an arbitrary payload to every open socket a given user has connected. */
export const broadcastToUser = (userId: string, payload: any) => {
  const clients = userSubscriptions.get(userId);
  if (!clients || clients.size === 0) return;
  const message = JSON.stringify(payload);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

/** Push an arbitrary payload to every open socket for each user in the list. */
export const broadcastToUsers = (userIds: string[], payload: any) => {
  if (userIds.length === 0) return;
  const message = JSON.stringify(payload);
  let delivered = 0;
  userIds.forEach((userId) => {
    const clients = userSubscriptions.get(userId);
    if (!clients) return;
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        delivered++;
      }
    });
  });
  console.log(`[WEBSOCKET] broadcastToUsers: delivered to ${delivered} sockets across ${userIds.length} target users, type=${payload?.type}`);
};
