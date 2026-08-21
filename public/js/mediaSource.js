export class MediaSourceHandler extends EventTarget {
    constructor(inputElement) {
        super();
        this.inputElement = inputElement;
        this.currentUrl = null;
        this.videoIdentity = null;

        this.inputElement.addEventListener("change", (e) => this.handleFileSelect(e));
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Clean up previous URL
        if (this.currentUrl) {
            URL.revokeObjectURL(this.currentUrl);
        }

        this.currentUrl = URL.createObjectURL(file);
        
        // Generate a simple identity based on metadata. 
        // We don't hash the whole file for performance reasons.
        this.videoIdentity = {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified
        };

        this.dispatchEvent(new CustomEvent("video_selected", { 
            detail: { 
                url: this.currentUrl, 
                identity: this.videoIdentity 
            } 
        }));
    }

    static isIdentityMatch(id1, id2) {
        if (!id1 || !id2) return false;
        // Simple heuristic for file matching
        return id1.name === id2.name && id1.size === id2.size;
    }
}
