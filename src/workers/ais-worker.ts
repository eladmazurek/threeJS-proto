/**
 * AIS Data Worker
 *
 * Handles WebSocket connection to AIS relay server, buffering, and parsing.
 * Offloads JSON parsing and state management from the main thread.
 *
 * The relay server handles subscription - this worker just connects and receives data.
 */

// Mapping for AIS Ship Types to our internal visualization types
// 0=Unknown, 30=Fishing, 60=Passenger, 70=Cargo, 80=Tanker, 90=Other
function getShipCategory(type: number): number {
    // Return a numeric category that the main thread can map to a string/icon
    // 0: Unknown/Other
    // 1: Cargo
    // 2: Tanker
    // 3: Passenger
    // 4: Fishing
    // 5: Military/Law Enforcement
    // 6: Pleasure/Sailing
    
    if (type >= 70 && type < 80) return 1; // Cargo
    if (type >= 80 && type < 90) return 2; // Tanker
    if (type >= 60 && type < 70) return 3; // Passenger
    if (type === 30) return 4; // Fishing
    if (type === 35 || type === 55) return 5; // Military/Law
    if (type >= 36 && type <= 37) return 6; // Pleasure
    return 0;
}

interface ShipData {
    mmsi: number;
    lat: number;
    lon: number;
    heading: number;
    speed: number;
    type: number;
    name: string;
    flag: string;
    destination: string;
    length: number;
    width: number;
    lastUpdate: number;
}

let socket: WebSocket | null = null;
const ships = new Map<number, ShipData>();
let relayUrl = ""; // Passed via init

// Message buffer
let messageQueue: any[] = [];
let processInterval: ReturnType<typeof setInterval> | null = null;
let pruneInterval: ReturnType<typeof setInterval> | null = null;

// Config
const PRUNE_INTERVAL = 60000; // Prune stale ships every minute
const STALE_THRESHOLD = 300000; // 5 minutes

self.onmessage = (e: MessageEvent) => {
    const { type, data } = e.data;

    if (type === 'init') {
        relayUrl = data.relayUrl;
        connect();
        
        // Start periodic processing loop (10Hz)
        // We buffer high-frequency messages and send batches to main thread
        processInterval = setInterval(processQueue, 100);

        // Start pruning loop
        pruneInterval = setInterval(pruneStaleShips, PRUNE_INTERVAL);
    } 
    else if (type === 'stop') {
        if (socket) {
            socket.close();
            socket = null;
        }
        if (processInterval) {
            clearInterval(processInterval);
            processInterval = null;
        }
        if (pruneInterval) {
            clearInterval(pruneInterval);
            pruneInterval = null;
        }
        // Clear state
        ships.clear();
        messageQueue = [];
    }
};

function connect() {
    if (socket) return;

    console.log(`[AISWorker] Connecting to ${relayUrl}...`);
    socket = new WebSocket(relayUrl);

    socket.onopen = () => {
        console.log('[AISWorker] Connected to relay server');
        // Relay server handles subscription - no message needed
    };

    socket.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            messageQueue.push(msg);
        } catch (err) {
            console.error('[AISWorker] JSON Parse Error:', err);
        }
    };

    socket.onclose = (event) => {
        console.log('[AISWorker] Disconnected:', event.code, event.reason);
        socket = null;
        // Simple reconnect logic (exponential backoff could be better)
        setTimeout(connect, 5000);
    };
    
    socket.onerror = (error) => {
        console.error('[AISWorker] Error:', error);
    };
}

function processQueue() {
    if (messageQueue.length === 0) return;

    const updates: Float64Array[] = [];
    // We send a flat buffer of updates:
    // [MMSI, Lat, Lon, Heading, Speed, Type, NameHash?]
    // Actually, sending objects is fine for the "Updates" pattern used by FeedManager.
    // FeedManager expects an array of ShipUpdate objects.
    
    // Process queue and merge updates for same ship
    const batchUpdates = new Map<number, any>();
    
    const queueSize = messageQueue.length;
    for (let i = 0; i < queueSize; i++) {
        const msg = messageQueue[i];
        const type = msg.MessageType;
        const mmsi = msg.MetaData?.MMSI;

        if (!mmsi) continue;

        let ship = ships.get(mmsi);
        if (!ship) {
            ship = {
                mmsi,
                lat: 0,
                lon: 0,
                heading: 0,
                speed: 0,
                type: 0,
                name: msg.MetaData.ShipName || "",
                flag: msg.MetaData.Flag || "",
                destination: "",
                length: 0,
                width: 0,
                lastUpdate: 0
            };
            ships.set(mmsi, ship);
        }
        
        // Update metadata if it arrived in this message
        if (msg.MetaData.ShipName && !ship.name) ship.name = msg.MetaData.ShipName;
        if (msg.MetaData.Flag && !ship.flag) ship.flag = msg.MetaData.Flag;

        ship.lastUpdate = Date.now();

        if (type === 'PositionReport') {
            const report = msg.Message.PositionReport;
            ship.lat = report.Latitude;
            ship.lon = report.Longitude;
            ship.heading = report.TrueHeading === 511 ? 0 : report.TrueHeading; // 511 = N/A
            ship.speed = report.Sog; // Speed over ground in knots
            
            batchUpdates.set(mmsi, {
                mmsi: ship.mmsi,
                lat: ship.lat,
                lon: ship.lon,
                heading: ship.heading,
                sog: ship.speed,
                name: ship.name, // Send name just in case it wasn't known
                type: ship.type,
                flag: ship.flag
            });
        } 
        else if (type === 'ShipStaticData') {
            const report = msg.Message.ShipStaticData;
            ship.name = report.Name;
            ship.type = getShipCategory(report.Type);
            
            // Clean destination text
            if (report.Destination) {
                ship.destination = report.Destination.replace(/[^A-Za-z0-9\s]/g, "").trim();
            }
            
            // Dimensions (A+B = Length, C+D = Width)
            if (report.Dimension) {
                ship.length = (report.Dimension.A || 0) + (report.Dimension.B || 0);
                ship.width = (report.Dimension.C || 0) + (report.Dimension.D || 0);
            }
            
            // If we have a position, send an update with the new metadata
            if (ship.lat !== 0 && ship.lon !== 0) {
                 batchUpdates.set(mmsi, {
                    mmsi: ship.mmsi,
                    lat: ship.lat,
                    lon: ship.lon,
                    heading: ship.heading,
                    sog: ship.speed,
                    name: ship.name,
                    type: ship.type,
                    flag: ship.flag,
                    dest: ship.destination,
                    len: ship.length,
                    wid: ship.width
                });
            }
        }
    }
    
    // Capture queue size BEFORE clearing
    const processedQueueSize = queueSize;
    messageQueue = []; // Clear queue

    if (batchUpdates.size > 0) {
        // Convert map values to array
        const updateArray = Array.from(batchUpdates.values());
        self.postMessage({
            type: 'update',
            updates: updateArray,
            queueSize: processedQueueSize
        });
    }
}

function pruneStaleShips() {
    const now = Date.now();
    for (const [mmsi, ship] of ships) {
        if (now - ship.lastUpdate > STALE_THRESHOLD) {
            ships.delete(mmsi);
        }
    }
}
