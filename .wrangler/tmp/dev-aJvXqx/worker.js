var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-pRSdbX/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/bundle-pRSdbX/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// public/js/protocol.js
var MessageTypes = {
  // Room Setup & Connection
  JOIN_ROOM: "JOIN_ROOM",
  // Client -> Server: Request to join
  ROOM_STATE: "ROOM_STATE",
  // Server -> Client: Initial/full state
  PARTICIPANT_JOINED: "PARTICIPANT_JOINED",
  // Server -> Client
  PARTICIPANT_LEFT: "PARTICIPANT_LEFT",
  // Server -> Client
  HOST_CHANGED: "HOST_CHANGED",
  // Server -> Client
  ERROR: "ERROR",
  // Server -> Client
  // Video Setup
  VIDEO_SELECTED: "VIDEO_SELECTED",
  // Client -> Server: Client announces their local video identity
  VIDEO_READY: "VIDEO_READY",
  // Client -> Server: Client is ready to play
  // Playback Sync
  PLAY: "PLAY",
  // Host -> Server, Server -> Client
  PAUSE: "PAUSE",
  // Host -> Server, Server -> Client
  SEEK: "SEEK",
  // Host -> Server, Server -> Client
  SET_PLAYBACK_RATE: "SET_PLAYBACK_RATE",
  // Host -> Server, Server -> Client
  // Heartbeat / Drift Correction
  SYNC_REQUEST: "SYNC_REQUEST",
  // Client -> Server: Ask for server time / state
  SYNC_RESPONSE: "SYNC_RESPONSE",
  // Server -> Client: Server time and authoritative state
  PING: "PING",
  PONG: "PONG"
};
function parseMessage(data) {
  try {
    return JSON.parse(data);
  } catch (e) {
    return { type: MessageTypes.ERROR, payload: { message: "Invalid JSON" } };
  }
}
__name(parseMessage, "parseMessage");
function createMessage(type, payload = {}) {
  return JSON.stringify({ type, payload });
}
__name(createMessage, "createMessage");

// src/room.js
var Room = class {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = /* @__PURE__ */ new Map();
    this.hostId = null;
    this.roomId = null;
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
    this.roomId = url.pathname.split("/")[3];
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    await this.handleSession(server, url.searchParams.get("name") || "Anonymous");
    return new Response(null, {
      status: 101,
      webSocket: client
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
    if (!this.hostId) {
      this.hostId = sessionId;
      session.isHost = true;
    }
    const initialState = this.getRoomState();
    initialState.yourId = sessionId;
    webSocket.send(createMessage(MessageTypes.ROOM_STATE, initialState));
    this.broadcast(createMessage(MessageTypes.PARTICIPANT_JOINED, {
      participant: this.getParticipantInfo(session)
    }), webSocket);
    webSocket.addEventListener("message", async (msg) => {
      const data = parseMessage(msg.data);
      this.handleMessage(session, data);
    });
    webSocket.addEventListener("close", () => {
      this.sessions.delete(webSocket);
      if (this.hostId === sessionId) {
        this.hostId = null;
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
      this.broadcast(createMessage(MessageTypes.ROOM_STATE, this.getRoomState()));
    });
  }
  handleMessage(session, data) {
    if (!data || !data.type)
      return;
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
        if (session.isHost) {
          this.videoIdentity = session.videoIdentity;
        }
        this.broadcast(createMessage(MessageTypes.ROOM_STATE, this.getRoomState()));
        break;
      case MessageTypes.VIDEO_READY:
        session.videoReady = true;
        this.broadcast(createMessage(MessageTypes.ROOM_STATE, this.getRoomState()));
        break;
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
        if (data.payload?.position !== void 0) {
          this.playbackState.position = data.payload.position;
        }
        if (data.payload?.playbackRate !== void 0) {
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
    const participants = Array.from(this.sessions.values()).map((s) => this.getParticipantInfo(s));
    return {
      roomId: this.roomId,
      hostId: this.hostId,
      videoIdentity: this.videoIdentity,
      playbackState: this.playbackState,
      participants,
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
        }
      }
    }
  }
};
__name(Room, "Room");

// src/worker.js
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/room/")) {
      const pathParts = url.pathname.split("/");
      const roomId = pathParts[3];
      if (!roomId) {
        return new Response("Missing room ID", { status: 400 });
      }
      const id = env.ROOMS.idFromName(roomId);
      const roomObject = env.ROOMS.get(id);
      return roomObject.fetch(request);
    }
    if (url.pathname.startsWith("/room/")) {
      return env.ASSETS.fetch(new Request(new URL("/room", request.url), request));
    }
    return env.ASSETS.fetch(request);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-pRSdbX/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-pRSdbX/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Room,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
