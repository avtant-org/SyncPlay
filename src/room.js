import { MessageTypes, parseMessage, createMessage } from '../public/js/protocol.js';

export class Room {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = new Map(); // webSocket -> session state
        this.hostId = null;
        this.roomId = null;
        
        // Authoritative playback state
        this.playbackState = {
            playing: false,
            position: 0,
            playbackRate: 1,
            serverTimestamp: Date.now()
        };
        
        this.videoIdentity = null;
    }

    async fetch(request) {
        const url = new URL(request.url);
        
        // Extract room ID from URL /api/room/:roomId
        this.roomId = url.pathname.split('/')[3];

        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("Expected Upgrade: websocket", { status: 426 });
        }

        const [client, server] = Object.values(new WebSocketPair());
        await this.handleSession(server, url.searchParams.get("name") || "Anonymous");

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    async handleSession(webSocket, participantName) {
        webSocket.accept();
        
        const sessionId = crypto.randomUUID();
        const session = {
            id: sessionId,
            name: participantName,
            isHost: false,
            videoReady: false,
            videoIdentity: null,
            ws: webSocket
        };

        this.sessions.set(webSocket, session);

        // Assign host if first to join
        if (!this.hostId) {
            this.hostId = sessionId;
            session.isHost = true;
        }

        // Send initial room state
        const initialState = this.getRoomState();
        initialState.yourId = sessionId;
        webSocket.send(createMessage(MessageTypes.ROOM_STATE, initialState));

        // Broadcast participant joined
        this.broadcast(createMessage(MessageTypes.PARTICIPANT_JOINED, {
            participant: this.getParticipantInfo(session)
        }), webSocket);

        webSocket.addEventListener("message", async (msg) => {
            const data = parseMessage(msg.data);
            this.handleMessage(session, data);
        });

        webSocket.addEventListener("close", () => {
            this.sessions.delete(webSocket);
            
            // Handle host disconnect
            if (this.hostId === sessionId) {
                this.hostId = null;
                // Assign new host if others exist
                if (this.sessions.size > 0) {
                    const nextHostSession = this.sessions.values().next().value;
                    this.hostId = nextHostSession.id;
                    nextHostSession.isHost = true;
                    
                    this.broadcast(createMessage(MessageTypes.HOST_CHANGED, {
                        hostId: this.hostId
                    }));
                }
            }

            this.broadcast(createMessage(MessageTypes.PARTICIPANT_LEFT, {
                participantId: sessionId
            }));
            
            // Update other clients with new full state to sync participant list properly
            this.broadcast(createMessage(MessageTypes.ROOM_STATE, this.getRoomState()));
        });
    }

    handleMessage(session, data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case MessageTypes.PING:
                session.ws.send(createMessage(MessageTypes.PONG, { clientTime: data.payload?.clientTime, serverTime: Date.now() }));
                break;

            case MessageTypes.SYNC_REQUEST:
                session.ws.send(createMessage(MessageTypes.SYNC_RESPONSE, {
                    serverTime: Date.now(),
                    playbackState: this.playbackState
                }));
                break;

            case MessageTypes.VIDEO_SELECTED:
                session.videoIdentity = data.payload.videoIdentity;
                
                // If this is host, update the global identity
                if (session.isHost) {
                    this.videoIdentity = session.videoIdentity;
                }
                this.broadcast(createMessage(MessageTypes.ROOM_STATE, this.getRoomState()));
                break;

            case MessageTypes.VIDEO_READY:
                session.videoReady = true;
                this.broadcast(createMessage(MessageTypes.ROOM_STATE, this.getRoomState()));
                break;

            // Host restricted commands
            case MessageTypes.PLAY:
            case MessageTypes.PAUSE:
            case MessageTypes.SEEK:
            case MessageTypes.SET_PLAYBACK_RATE:
                if (!session.isHost) {
                    session.ws.send(createMessage(MessageTypes.ERROR, { message: "Unauthorized: Only Host can control playback" }));
                    return;
                }

                if (data.type === MessageTypes.PLAY) {
                    this.playbackState.playing = true;
                } else if (data.type === MessageTypes.PAUSE) {
                    this.playbackState.playing = false;
                }
                
                if (data.payload?.position !== undefined) {
                    this.playbackState.position = data.payload.position;
                }
                
                if (data.payload?.playbackRate !== undefined) {
                    this.playbackState.playbackRate = data.payload.playbackRate;
                }

                this.playbackState.serverTimestamp = Date.now();

                this.broadcast(createMessage(data.type, {
                    ...this.playbackState
                }));
                break;
        }
    }

    getRoomState() {
        const participants = Array.from(this.sessions.values()).map(s => this.getParticipantInfo(s));
        return {
            roomId: this.roomId,
            hostId: this.hostId,
            videoIdentity: this.videoIdentity,
            playbackState: this.playbackState,
            participants: participants,
            serverTime: Date.now()
        };
    }

    getParticipantInfo(session) {
        return {
            id: session.id,
            name: session.name,
            isHost: session.isHost,
            videoReady: session.videoReady,
            videoIdentity: session.videoIdentity
        };
    }

    broadcast(message, excludeWs = null) {
        for (const [ws, session] of this.sessions) {
            if (ws !== excludeWs) {
                try {
                    ws.send(message);
                } catch (e) {
                    // Ignore send errors, cleanup is handled in 'close' event
                }
            }
        }
    }
}
