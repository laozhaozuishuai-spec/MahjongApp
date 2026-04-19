/**
 * MahjongApp WebSocket 中继（仅转发，不做规则校验）
 *
 * - 启动：npm install && npm start；默认 PORT=31987
 * - 房间：同名 room 即同一桌
 * - join：按连接加入顺序分配物理座位 SEAT_ORDER = S→N→E→W 循环
 * - state：存 lastState，并向房间内**所有**已连接客户端广播同一份 tableState（不含座位信息；座位只在 joined 里告知本连接）
 * - rtc_signal：WebRTC 信令，按 `to` 转发给指定 peer（用于房间内语音）
 */
const crypto = require('crypto');
const WebSocket = require('ws');

function genPeerId() {
  return crypto.randomBytes(8).toString('hex');
}

const port = Number(process.env.PORT) || 31987;
const host = process.env.HOST || '0.0.0.0';
const wss = new WebSocket.Server({ port, host });

wss.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `[Mahjong relay] 端口 ${port} 已被占用。可换端口启动，例如：PORT=31988 npm start`
    );
  } else {
    console.error('[Mahjong relay]', err);
  }
  process.exit(1);
});

wss.on('listening', () => {
  console.log(
    `Mahjong relay ws://${host}:${port}（本机 ws://127.0.0.1:${port}，局域网用电脑 IP）`
  );
});

/** @type {Map<string, { clients: Set<import('ws')>, lastState: object|null, joinOrder: import('ws')[], seatMap: Map<import('ws'), string> }>} */
const rooms = new Map();

function ensureSeatMap(room) {
  if (!room.seatMap) room.seatMap = new Map();
}

const SEAT_ORDER = ['S', 'N', 'E', 'W'];

function seatForClient(room, client) {
  ensureSeatMap(room);
  const idx = room.joinOrder.indexOf(client);
  if (idx >= 0) return SEAT_ORDER[idx % 4];
  const s = room.seatMap.get(client);
  return s === 'S' || s === 'N' || s === 'E' || s === 'W' ? s : 'S';
}

wss.on('connection', (ws) => {
  let roomId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join' && typeof msg.room === 'string') {
      roomId = msg.room.slice(0, 64);
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          clients: new Set(),
          lastState: null,
          joinOrder: [],
          seatMap: new Map(),
        });
      }
      const room = rooms.get(roomId);
      ensureSeatMap(room);

      if (room.joinOrder.includes(ws)) {
        if (!ws.mjPeerId) ws.mjPeerId = genPeerId();
        const seat = seatForClient(room, ws);
        const seatIndex = SEAT_ORDER.indexOf(seat);
        const joinIndex = room.joinOrder.indexOf(ws);
        const rtcPeers = [...room.clients]
          .filter((c) => c !== ws)
          .map((c) => c.mjPeerId)
          .filter(Boolean);
        ws.send(
          JSON.stringify({
            type: 'joined',
            room: roomId,
            peers: room.clients.size,
            seat,
            seatIndex: seatIndex >= 0 ? seatIndex : 0,
            joinIndex: joinIndex >= 0 ? joinIndex : 0,
            peerId: ws.mjPeerId,
            rtcPeers,
          })
        );
        if (room.lastState) {
          ws.send(JSON.stringify({ type: 'state', room: roomId, state: room.lastState }));
        }
        return;
      }

      if (!ws.mjPeerId) ws.mjPeerId = genPeerId();
      const rtcPeers = [...room.clients].map((c) => c.mjPeerId).filter(Boolean);
      room.clients.add(ws);
      room.joinOrder.push(ws);
      const joinIndex = room.joinOrder.length - 1;
      const seat = SEAT_ORDER[joinIndex % 4];
      room.seatMap.set(ws, seat);
      const seatIndex = joinIndex % 4;
      ws.send(
        JSON.stringify({
          type: 'joined',
          room: roomId,
          peers: room.clients.size,
          seat,
          seatIndex,
          joinIndex,
          peerId: ws.mjPeerId,
          rtcPeers,
        })
      );
      const joinedPayload = JSON.stringify({
        type: 'rtc_peer_joined',
        room: roomId,
        peerId: ws.mjPeerId,
      });
      for (const client of room.clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) client.send(joinedPayload);
      }
      if (room.lastState) {
        ws.send(JSON.stringify({ type: 'state', room: roomId, state: room.lastState }));
      }
      return;
    }

    if (
      msg.type === 'rtc_signal' &&
      typeof msg.room === 'string' &&
      roomId &&
      msg.room === roomId &&
      typeof msg.to === 'string' &&
      msg.payload !== undefined &&
      ws.mjPeerId
    ) {
      const room = rooms.get(roomId);
      if (!room) return;
      for (const client of room.clients) {
        if (client.mjPeerId === msg.to && client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: 'rtc_signal',
              room: roomId,
              from: ws.mjPeerId,
              payload: msg.payload,
            })
          );
          return;
        }
      }
      return;
    }

    if (
      msg.type === 'state' &&
      msg.state &&
      typeof msg.room === 'string' &&
      roomId &&
      msg.room === roomId
    ) {
      const room = rooms.get(roomId);
      if (!room) return;
      room.lastState = msg.state;
      const payload = JSON.stringify({ type: 'state', room: roomId, state: msg.state });
      for (const client of room.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
      }
    }
  });

  ws.on('close', () => {
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const leftId = ws.mjPeerId;
    room.clients.delete(ws);
    room.joinOrder = room.joinOrder.filter((c) => c !== ws);
    ensureSeatMap(room);
    room.seatMap.delete(ws);
    if (leftId) {
      const payload = JSON.stringify({
        type: 'rtc_peer_left',
        room: roomId,
        peerId: leftId,
      });
      for (const client of room.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
      }
    }
    if (room.clients.size === 0) rooms.delete(roomId);
  });
});
