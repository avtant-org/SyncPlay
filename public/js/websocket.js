import { MessageTypes, createMessage, parseMessage } from './protocol.js';

export class SyncWebSocket extends EventTarget {
    constructor(roomId, participantName) {
        super();
        this.roomId = roomId;
        this.participantName = participantName;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.intentionalClose = false;
        
        // Time sync
        this.serverTimeOffset = 0;
        
        this.connect();
    }

    connect() {
        // Use wss:// if https, ws:// if http
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/room/${this.roomId}?name=${encodeURIComponent(this.participantName)}`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.addEventListener("open", () => {
            console.log("WebSocket connected");
            this.reconnectAttempts = 0;
            this.dispatchEvent(new Event("connected"));
            
            // Start pinging for time sync
            this.pingInterval = setInterval(() => this.ping(), 5000);
            this.ping();
        });

        this.ws.addEventListener("message", (event) => {
            const data = parseMessage(event.data);
            
            if (data.type === MessageTypes.PONG) {
                this.handlePong(data.payload);
            } else {
                const customEvent = new CustomEvent("message", { detail: data });
                this.dispatchEvent(customEvent);
            }
        });

        this.ws.addEventListener("close", () => {
            console.log("WebSocket disconnected");
            clearInterval(this.pingInterval);
            this.dispatchEvent(new Event("disconnected"));
            
            if (!this.intentionalClose) {
                this.scheduleReconnect();
            }
        });
        
        this.ws.addEventListener("error", (error) => {
            console.error("WebSocket error:", error);
        });
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("Max reconnect attempts reached");
            this.dispatchEvent(new Event("reconnect_failed"));
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
        this.reconnectAttempts++;
        console.log(`Reconnecting in ${delay}ms...`);
        
        setTimeout(() => this.connect(), delay);
    }

    send(type, payload = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(createMessage(type, payload));
        }
    }

    ping() {
        this.send(MessageTypes.PING, { clientTime: Date.now() });
    }

    handlePong(payload) {
        if (!payload || !payload.clientTime || !payload.serverTime) return;
        
        const now = Date.now();
        const rtt = now - payload.clientTime;
        const estimatedServerTime = payload.serverTime + (rtt / 2);
        
        // Smooth the offset calculation
        const newOffset = estimatedServerTime - now;
        if (this.serverTimeOffset === 0) {
            this.serverTimeOffset = newOffset;
        } else {
            this.serverTimeOffset = (this.serverTimeOffset * 0.8) + (newOffset * 0.2);
        }
    }

    getServerTime() {
        return Date.now() + this.serverTimeOffset;
    }

    close() {
        this.intentionalClose = true;
        if (this.ws) {
            this.ws.close();
        }
    }
}
