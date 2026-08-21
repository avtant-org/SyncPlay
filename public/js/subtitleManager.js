export class SubtitleManager {
    constructor(videoElement, listContainer, statusContainer, fileInput) {
        this.video = videoElement;
        this.listContainer = listContainer;
        this.statusContainer = statusContainer;
        this.fileInput = fileInput;
        
        this.availableTracks = [];
        this.activeTrackId = 'off';
        
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    handleNewVideo() {
        this.cleanup();
        this.statusContainer.innerText = "Detecting subtitles...";
        this.renderUI();

        // Wait for metadata to load to check native text tracks
        this.video.addEventListener('loadedmetadata', () => {
            this.detectEmbeddedSubtitles();
        }, { once: true });
        
        // Also fire if metadata is already loaded (e.g. late hookup)
        if (this.video.readyState >= 1) {
             this.detectEmbeddedSubtitles();
        }
    }

    detectEmbeddedSubtitles() {
        // Find native tracks
        const nativeTracks = Array.from(this.video.textTracks);
        
        if (nativeTracks.length > 0) {
            this.statusContainer.innerText = "";
            this.statusContainer.classList.add("hidden");
            
            nativeTracks.forEach((track, index) => {
                // Ensure they are hidden by default so we can control them
                track.mode = 'hidden'; 
                
                this.availableTracks.push({
                    id: `native-${index}`,
                    label: track.label || track.language || `Track ${index + 1}`,
                    isExternal: false,
                    nativeTrack: track
                });
            });
        } else {
            this.statusContainer.innerText = "No embedded subtitles found.";
            this.statusContainer.classList.remove("hidden");
        }
        
        this.renderUI();
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            let text = await file.text();
            text = text.replace(/^\uFEFF/, ''); // Strip BOM
            let vttContent = text;
            
            // Basic SRT to VTT conversion if needed
            if (file.name.toLowerCase().endsWith('.srt')) {
                vttContent = this.convertSrtToVtt(text);
            } else if (!vttContent.trim().startsWith('WEBVTT')) {
                throw new Error("Invalid VTT file");
            }

            const blob = new Blob([vttContent], { type: 'text/vtt' });
            const url = URL.createObjectURL(blob);
            
            const trackElement = document.createElement('track');
            trackElement.kind = 'subtitles';
            trackElement.label = file.name;
            trackElement.srclang = 'en'; // Provide fallback language
            trackElement.src = url;
            
            // Add to video
            this.video.appendChild(trackElement);
            
            // Add to our list
            const id = `ext-${Date.now()}`;
            this.availableTracks.push({
                id: id,
                label: file.name,
                isExternal: true,
                trackElement: trackElement,
                nativeTrack: trackElement.track,
                objectUrl: url
            });
            
            // Auto select the new track
            this.setActiveTrack(id);
            
            this.statusContainer.innerText = "";
            this.statusContainer.classList.add("hidden");
            
        } catch (err) {
            console.error(err);
            this.statusContainer.innerText = "Unable to read subtitle file.";
            this.statusContainer.classList.remove("hidden");
        }
        
        // Reset input so the same file can be selected again
        this.fileInput.value = "";
    }

    convertSrtToVtt(srtData) {
        let vtt = 'WEBVTT\n\n';
        // Replace comma with dot in timestamps (00:00:02,500 -> 00:00:02.500)
        vtt += srtData.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        return vtt;
    }

    setActiveTrack(id) {
        this.activeTrackId = id;
        
        // Hide all native tracks we know about
        this.availableTracks.forEach(t => {
            const trackObj = t.nativeTrack || (t.trackElement && t.trackElement.track);
            if (trackObj) {
                trackObj.mode = 'hidden';
            }
        });
        
        // Show the selected one
        if (id !== 'off') {
            const track = this.availableTracks.find(t => t.id === id);
            if (track) {
                const trackObj = track.nativeTrack || (track.trackElement && track.trackElement.track);
                if (trackObj) {
                    trackObj.mode = 'showing';
                }
                
                if (track.trackElement) {
                    track.trackElement.default = true;
                }
            }
        }
        
        this.renderUI();
    }

    removeExternalTrack(id) {
        const trackIndex = this.availableTracks.findIndex(t => t.id === id);
        if (trackIndex > -1) {
            const track = this.availableTracks[trackIndex];
            if (track.isExternal) {
                if (track.trackElement && track.trackElement.parentNode) {
                    track.trackElement.parentNode.removeChild(track.trackElement);
                }
                if (track.objectUrl) {
                    URL.revokeObjectURL(track.objectUrl);
                }
            }
            this.availableTracks.splice(trackIndex, 1);
            
            if (this.activeTrackId === id) {
                this.setActiveTrack('off');
            } else {
                this.renderUI();
            }
        }
    }

    cleanup() {
        // Remove external tracks from DOM and revoke URLs
        this.availableTracks.forEach(track => {
            if (track.isExternal) {
                if (track.trackElement && track.trackElement.parentNode) {
                    track.trackElement.parentNode.removeChild(track.trackElement);
                }
                if (track.objectUrl) {
                    URL.revokeObjectURL(track.objectUrl);
                }
            }
        });
        
        this.availableTracks = [];
        this.activeTrackId = 'off';
        
        // Try to hide any dangling native tracks (we can't remove them if they are embedded)
        Array.from(this.video.textTracks).forEach(t => t.mode = 'hidden');
        
        this.statusContainer.innerText = "Waiting for video...";
        this.statusContainer.classList.remove("hidden");
        this.renderUI();
    }

    renderUI() {
        this.listContainer.innerHTML = "";
        
        if (this.availableTracks.length === 0) {
            return;
        }

        // Add 'Off' option
        this.listContainer.appendChild(this.createTrackItem('off', 'Off', false));
        
        // Add all available tracks
        this.availableTracks.forEach(track => {
            this.listContainer.appendChild(this.createTrackItem(track.id, track.label, track.isExternal));
        });
    }
    
    createTrackItem(id, label, isExternal) {
        const li = document.createElement("li");
        li.className = `subtitle-item ${this.activeTrackId === id ? 'active' : ''}`;
        
        const nameDiv = document.createElement("div");
        nameDiv.className = "subtitle-name";
        
        const indicator = document.createElement("div");
        indicator.className = "subtitle-indicator";
        
        const labelText = document.createElement("span");
        labelText.innerText = label;
        
        nameDiv.appendChild(indicator);
        nameDiv.appendChild(labelText);
        
        li.appendChild(nameDiv);
        
        // Click to activate
        nameDiv.addEventListener("click", () => this.setActiveTrack(id));
        
        // Add remove button for external tracks
        if (isExternal) {
            const removeBtn = document.createElement("span");
            removeBtn.innerHTML = "&times;";
            removeBtn.style.color = "var(--text-muted)";
            removeBtn.style.fontSize = "1.2rem";
            removeBtn.style.padding = "0 0.5rem";
            removeBtn.style.cursor = "pointer";
            removeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.removeExternalTrack(id);
            });
            li.appendChild(removeBtn);
        }
        
        return li;
    }
}
