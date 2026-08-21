/**
 * Shared Protocol for SyncPlay
 * Used by both the Cloudflare Worker and the Browser client.
 */

export const MessageTypes = {
    // Room Setup & Connection
    JOIN_ROOM: "JOIN_ROOM",                 // Client -> Server: Request to join
    ROOM_STATE: "ROOM_STATE",               // Server -> Client: Initial/full state
    PARTICIPANT_JOINED: "PARTICIPANT_JOINED", // Server -> Client
    PARTICIPANT_LEFT: "PARTICIPANT_LEFT",     // Server -> Client
    HOST_CHANGED: "HOST_CHANGED",             // Server -> Client
    ERROR: "ERROR",                           // Server -> Client

    // Video Setup
    VIDEO_SELECTED: "VIDEO_SELECTED",         // Client -> Server: Client announces their local video identity
    VIDEO_READY: "VIDEO_READY",               // Client -> Server: Client is ready to play

    // Playback Sync
    PLAY: "PLAY",                             // Host -> Server, Server -> Client
    PAUSE: "PAUSE",                           // Host -> Server, Server -> Client
    SEEK: "SEEK",                             // Host -> Server, Server -> Client
    SET_PLAYBACK_RATE: "SET_PLAYBACK_RATE",   // Host -> Server, Server -> Client
    
    // Heartbeat / Drift Correction
    SYNC_REQUEST: "SYNC_REQUEST",             // Client -> Server: Ask for server time / state
    SYNC_RESPONSE: "SYNC_RESPONSE",           // Server -> Client: Server time and authoritative state
    PING: "PING",
    PONG: "PONG"
};

/**
 * Helper to parse messages safely.
 */
export function parseMessage(data) {
    try {
        return JSON.parse(data);
    } catch (e) {
        return { type: MessageTypes.ERROR, payload: { message: "Invalid JSON" } };
    }
}

/**
 * Helper to stringify messages.
 */
export function createMessage(type, payload = {}) {
    return JSON.stringify({ type, payload });
}
