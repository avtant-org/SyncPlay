export class VideoPlayer extends EventTarget {
    constructor(videoElement) {
        super();
        this.video = videoElement;
        this.isApplyingRemoteState = false;
        
        this.setupListeners();
    }

    setupListeners() {
        this.video.addEventListener("play", () => {
            if (!this.isApplyingRemoteState) {
                this.dispatchEvent(new CustomEvent("local_play", { detail: { position: this.video.currentTime } }));
            }
        });

        this.video.addEventListener("pause", () => {
            if (!this.isApplyingRemoteState) {
                this.dispatchEvent(new CustomEvent("local_pause", { detail: { position: this.video.currentTime } }));
            }
        });

        this.video.addEventListener("seeked", () => {
            if (!this.isApplyingRemoteState) {
                this.dispatchEvent(new CustomEvent("local_seek", { detail: { position: this.video.currentTime } }));
            }
        });
        
        this.video.addEventListener("ratechange", () => {
            if (!this.isApplyingRemoteState) {
                this.dispatchEvent(new CustomEvent("local_ratechange", { detail: { rate: this.video.playbackRate } }));
            }
        });
    }

    setSource(url) {
        this.video.src = url;
    }

    async applyRemoteState(playing, position, playbackRate, isHost) {
        this.isApplyingRemoteState = true;
        
        try {
            // Apply playback rate
            if (Math.abs(this.video.playbackRate - playbackRate) > 0.01 && isHost) { // Only set rate directly if we are host, viewers manage their own rate for drift
                 this.video.playbackRate = playbackRate;
            }

            // Apply seek if we are too far off (handled mainly by sync.js, but direct application here for big jumps)
            if (Math.abs(this.video.currentTime - position) > 2) {
                this.video.currentTime = position;
            }
            
            // Apply play/pause state
            if (playing && this.video.paused) {
                try {
                    await this.video.play();
                } catch (e) {
                    // Autoplay blocked
                    this.dispatchEvent(new Event("autoplay_blocked"));
                }
            } else if (!playing && !this.video.paused) {
                this.video.pause();
            }
        } finally {
            // Give a tiny delay before re-enabling local event firing to ensure native events have settled
            setTimeout(() => {
                this.isApplyingRemoteState = false;
            }, 50);
        }
    }
    
    // For sync.js to safely tweak things without triggering 'local' events
    safeSetCurrentTime(time) {
        this.isApplyingRemoteState = true;
        this.video.currentTime = time;
        setTimeout(() => this.isApplyingRemoteState = false, 50);
    }

    safeSetPlaybackRate(rate) {
        this.isApplyingRemoteState = true;
        this.video.playbackRate = rate;
        setTimeout(() => this.isApplyingRemoteState = false, 50);
    }
}
