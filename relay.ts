import { WebSocket, WebSocketServer } from 'ws';

const AIS_STREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const PORT = 8080;

const wss = new WebSocketServer({ port: PORT });

console.log(`[AIS Relay] Starting WebSocket Relay on port ${PORT}`);

wss.on('connection', (clientWs) => {
    console.log('[AIS Relay] Client connected');

    const remoteWs = new WebSocket(AIS_STREAM_URL);

    // Queue messages from client until remote is open
    const messageQueue: string[] = [];

    clientWs.on('message', (data) => {
        const msg = data.toString();
        // console.log('[AIS Relay] Client -> Remote:', msg);
        if (remoteWs.readyState === WebSocket.OPEN) {
            remoteWs.send(msg);
        } else {
            messageQueue.push(msg);
        }
    });

    remoteWs.on('open', () => {
        console.log('[AIS Relay] Connected to AISStream.io');
        // Flush queue
        while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            if (msg) remoteWs.send(msg);
        }
    });

    remoteWs.on('message', (data) => {
        // Ensure we forward text
        const msg = data.toString();
        // console.log('[AIS Relay] Remote -> Client:', msg.substring(0, 50) + '...');
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(msg);
        }
    });

    remoteWs.on('error', (err) => {
        console.error('[AIS Relay] Remote Error:', err.message);
        clientWs.close();
    });

    remoteWs.on('close', () => {
        console.log('[AIS Relay] Remote Connection Closed');
        clientWs.close();
    });

    clientWs.on('error', (err) => {
        console.error('[AIS Relay] Client Error:', err.message);
        remoteWs.close();
    });

    clientWs.on('close', () => {
        console.log('[AIS Relay] Client Disconnected');
        remoteWs.close();
    });
});
