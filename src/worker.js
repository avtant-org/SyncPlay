export { Room } from './room.js';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // 1. WebSocket / API Routing
        if (url.pathname.startsWith('/api/room/')) {
            const pathParts = url.pathname.split('/');
            const roomId = pathParts[3]; // e.g., /api/room/A7K9P2
            
            if (!roomId) {
                return new Response("Missing room ID", { status: 400 });
            }

            // Get Durable Object for this room ID
            const id = env.ROOMS.idFromName(roomId);
            const roomObject = env.ROOMS.get(id);

            // Forward the request to the Durable Object
            return roomObject.fetch(request);
        }

        // 2. SPA Routing for room pages
        if (url.pathname.startsWith('/room/')) {
            // Serve the room.html page for /room/:id
            // Note: Cloudflare Assets uses clean URLs, so requesting /room.html returns a 307 to /room.
            // By requesting /room, we get the asset directly with a 200 OK.
            return env.ASSETS.fetch(new Request(new URL('/room', request.url), request));
        }

        // 3. Fallback: serve static assets (index.html, css, js)
        return env.ASSETS.fetch(request);
    }
};
