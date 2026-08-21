export class SyncController {
    constructor(player, websocket) {
        this.player = player;
        this.ws = websocket;
        
        this.authoritativeState = {
            playing: false,
            position: 0,
            playbackRate: 1,
            serverTimestamp: 0
        };
        
        this.isHost = false;
        this.syncInterval = null;
        
        this.DRIFT_TOLERANCE_MIN = 0.1; // seconds
        this.DRIFT_TOLERANCE_MAX = 2.0; // seconds
    }
    
    setHostStatus(isHost) {
        this.isHost = isHost;
    }

    updateAuthoritativeState(state) {
        // If state is older than what we have, ignore it
        if (state.serverTimestamp < this.authoritativeState.serverTimestamp) return;
        
        this.authoritativeState = { ...state };
        
        // Immediately apply major state changes
        this.player.applyRemoteState(
            this.authoritativeState.playing, 
            this.getExpectedPosition(), 
            this.authoritativeState.playbackRate,
            this.isHost
        );
    }

    getExpectedPosition() {
        if (!this.authoritativeState.playing) {
            return this.authoritativeState.position;
        }

        const currentServerTime = this.ws.getServerTime();
        const elapsedTimeSec = (currentServerTime - this.authoritativeState.serverTimestamp) / 1000;
        
        return this.authoritativeState.position + (elapsedTimeSec * this.authoritativeState.playbackRate);
    }

    startSyncLoop() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(() => this.checkDrift(), 1000);
    }

    stopSyncLoop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.player.safeSetPlaybackRate(1); // Reset to normal on stop
    }

    checkDrift() {
        // If we are host, we don't adjust our own drift, our state is the source of truth for others.
        // But we DO need to update the server occasionally if we play natively to keep server state fresh?
        // Actually, the server state only needs updating on explicit play/pause/seek events.
        if (this.isHost) return;
        
        if (!this.authoritativeState.playing || this.player.video.paused) return;

        const expectedPos = this.getExpectedPosition();
        const actualPos = this.player.video.currentTime;
        const drift = actualPos - expectedPos; // positive if we are ahead, negative if behind

        if (Math.abs(drift) > this.DRIFT_TOLERANCE_MAX) {
            // Hard seek
            console.log(`[Sync] Drift too large (${drift.toFixed(2)}s). Hard seeking to ${expectedPos.toFixed(2)}`);
            this.player.safeSetCurrentTime(expectedPos);
            this.player.safeSetPlaybackRate(this.authoritativeState.playbackRate);
        } else if (Math.abs(drift) > this.DRIFT_TOLERANCE_MIN) {
            // Smooth correction
            let correctionRate = this.authoritativeState.playbackRate;
            if (drift > 0) {
                // We are ahead, slow down
                correctionRate = Math.max(0.2, this.authoritativeState.playbackRate - 0.05);
            } else {
                // We are behind, speed up
                correctionRate = Math.min(2.0, this.authoritativeState.playbackRate + 0.05);
            }
            console.log(`[Sync] Correcting drift (${drift.toFixed(2)}s). Adjusting rate to ${correctionRate}`);
            this.player.safeSetPlaybackRate(correctionRate);
        } else {
            // In sync
            if (this.player.video.playbackRate !== this.authoritativeState.playbackRate) {
                this.player.safeSetPlaybackRate(this.authoritativeState.playbackRate);
            }
        }
    }
}
