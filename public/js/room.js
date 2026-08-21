import { SyncWebSocket } from './websocket.js';
import { MessageTypes } from './protocol.js';
import { VideoPlayer } from './player.js';
import { MediaSourceHandler } from './mediaSource.js';
import { SyncController } from './sync.js';
import { SubtitleManager } from './subtitleManager.js';

document.addEventListener("DOMContentLoaded", () => {
    // 1. Get Room ID and Participant Name from URL
    const urlParts = window.location.pathname.split('/');
    const roomId = urlParts[2]; // /room/A7K9P2
    
    const params = new URLSearchParams(window.location.search);
    const participantName = params.get("name") || localStorage.getItem("syncplay_name") || "Anonymous";

    if (!roomId) {
        window.location.href = "/";
        return;
    }

    // Update UI with Room ID
    document.getElementById("room-id-display").innerText = roomId;
    document.getElementById("room-id-display").addEventListener("click", () => {
        navigator.clipboard.writeText(window.location.href);
        showToast("Link copied to clipboard");
    });

    // 2. Initialize Components
    const ws = new SyncWebSocket(roomId, participantName);
    const player = new VideoPlayer(document.getElementById("player"));
    const syncController = new SyncController(player, ws);
    const mediaHandler = new MediaSourceHandler(document.getElementById("video-input"));
    const subtitleManager = new SubtitleManager(
        document.getElementById("player"),
        document.getElementById("subtitle-list"),
        document.getElementById("subtitle-status"),
        document.getElementById("subtitle-input")
    );
    
    let isHost = false;
    let localSessionId = null;
    let hostVideoIdentity = null;

    // 3. Setup WebSocket Event Listeners
    ws.addEventListener("message", (e) => {
        const msg = e.detail;
        
        switch (msg.type) {
            case MessageTypes.ROOM_STATE:
                handleRoomState(msg.payload);
                break;
            case MessageTypes.PARTICIPANT_JOINED:
                showToast(`${msg.payload.participant.name} joined`);
                break;
            case MessageTypes.PARTICIPANT_LEFT:
                // Full state update usually follows, so we can just wait for it, 
                // but a toast is nice
                break;
            case MessageTypes.HOST_CHANGED:
                if (msg.payload.hostId === localSessionId) {
                    showToast("You are now the Host");
                } else {
                    showToast("Host has changed");
                }
                break;
            case MessageTypes.PLAY:
            case MessageTypes.PAUSE:
            case MessageTypes.SEEK:
            case MessageTypes.SET_PLAYBACK_RATE:
            case MessageTypes.SYNC_RESPONSE:
                syncController.updateAuthoritativeState(msg.payload);
                break;
            case MessageTypes.ERROR:
                showToast(msg.payload.message, true);
                break;
        }
    });

    // 4. Setup Media Handler Listeners
    mediaHandler.addEventListener("video_selected", (e) => {
        const { url, identity } = e.detail;
        
        // Check if matches host (unless we are host)
        if (!isHost && hostVideoIdentity) {
            if (!MediaSourceHandler.isIdentityMatch(identity, hostVideoIdentity)) {
                const errDiv = document.getElementById("video-error");
                errDiv.innerText = "Video does not appear to match the Host's video.";
                errDiv.classList.remove("hidden");
                // Allow them to proceed anyway, but warn
            } else {
                document.getElementById("video-error").classList.add("hidden");
            }
        }
        
        player.setSource(url);
        subtitleManager.handleNewVideo();
        document.getElementById("file-select-overlay").classList.add("hidden");
        
        ws.send(MessageTypes.VIDEO_SELECTED, { videoIdentity: identity });
        
        // When metadata loads, we are ready
        player.video.addEventListener("loadedmetadata", () => {
            ws.send(MessageTypes.VIDEO_READY);
            
            // If there's an existing state, apply it (for late joiners)
            if (syncController.authoritativeState.playing || syncController.authoritativeState.position > 0) {
                 syncController.updateAuthoritativeState(syncController.authoritativeState);
            }
            syncController.startSyncLoop();
        }, { once: true });
    });

    // 5. Setup Local Player Listeners (Proxy to Server if Host)
    player.addEventListener("local_play", (e) => {
        if (isHost) ws.send(MessageTypes.PLAY, { position: e.detail.position });
    });
    player.addEventListener("local_pause", (e) => {
        if (isHost) ws.send(MessageTypes.PAUSE, { position: e.detail.position });
    });
    player.addEventListener("local_seek", (e) => {
        if (isHost) ws.send(MessageTypes.SEEK, { position: e.detail.position });
    });
    player.addEventListener("local_ratechange", (e) => {
        if (isHost) ws.send(MessageTypes.SET_PLAYBACK_RATE, { playbackRate: e.detail.rate });
    });

    // Handle Autoplay blocks
    player.addEventListener("autoplay_blocked", () => {
        const overlay = document.getElementById("autoplay-overlay");
        overlay.classList.remove("hidden");
        
        document.getElementById("btn-unlock-audio").onclick = () => {
            player.video.play().then(() => {
                overlay.classList.add("hidden");
            });
        };
    });

    // 6. UI Helpers
    function handleRoomState(state) {
        // Find our session to determine if we are host
        // We know our name, but there could be duplicates. 
        // We really should have our ID returned, but we can infer host by state.participants
        
        // Wait, the backend doesn't explicitly tell us which participant we are in the list.
        // We can infer it if we match the hostId? No, what if we aren't host.
        // Let's modify logic: the server sets our session ID, but we didn't receive it directly.
        // However, we can look at the hostId and compare with participant list.
        
        if (state.yourId) {
            localSessionId = state.yourId;
        }

        const participantsListUI = document.getElementById("participant-list");
        participantsListUI.innerHTML = "";
        
        document.getElementById("participant-count").innerText = state.participants.length;
        
        hostVideoIdentity = state.videoIdentity;
        
        state.participants.forEach(p => {
            // Render participant
            const li = document.createElement("li");
            li.className = "participant-item";
            
            const nameDiv = document.createElement("div");
            nameDiv.className = `participant-name ${p.isHost ? 'host' : ''}`;
            nameDiv.innerText = p.name;
            
            const statusDiv = document.createElement("div");
            statusDiv.className = `status-dot ${p.videoReady ? 'ready' : ''}`;
            statusDiv.title = p.videoReady ? "Video Ready" : "Selecting Video...";
            
            li.appendChild(nameDiv);
            li.appendChild(statusDiv);
            participantsListUI.appendChild(li);
        });

        isHost = state.hostId === localSessionId;
        syncController.setHostStatus(isHost);
        
        if (!isHost && hostVideoIdentity) {
            const infoDiv = document.getElementById("host-video-info");
            infoDiv.classList.remove("hidden");
            document.getElementById("host-video-name").innerText = hostVideoIdentity.name;
            document.getElementById("host-video-size").innerText = `${(hostVideoIdentity.size / (1024*1024)).toFixed(2)} MB`;
        }
        
        if (state.playbackState) {
            // Do not aggressively update authoritative state on every room state change
            // unless we are newly joining
            if (syncController.authoritativeState.serverTimestamp === 0) {
                 syncController.updateAuthoritativeState(state.playbackState);
            }
        }
    }

    function showToast(message, isError = false) {
        const toast = document.getElementById("toast");
        toast.innerText = message;
        if (isError) {
            toast.style.backgroundColor = "var(--error)";
        } else {
            toast.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
        }
        toast.classList.add("show");
        
        setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }
});
