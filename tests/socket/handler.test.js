const { handleConnection } = require("../../src/socket/handler");

// builds a fake ws object so you dont need a real server
function makeMockWs() {
    const listeners = {};
    return {
        session: null,
        sentMessages: [],
        send(data) { this.sentMessages.push(JSON.parse(data)); },
        on(event, cb) { listeners[event] = cb; },
        emit(event, ...args) { listeners[event]?.(...args); },
    };
}

describe("handleConnection", () => {
    test("creates a session on connection", () => {
        const ws = makeMockWs();
        handleConnection(ws);
        expect(ws.session).not.toBeNull();
        expect(ws.session.isReady).toBe(false);
        expect(ws.session.isProcessing).toBe(false);
    });
});

describe("handleMessages - init", () => {
    test("sets languages and sends ready", () => {
        const ws = makeMockWs();
        handleConnection(ws);

        const initMsg = JSON.stringify({ type: "init", sourceLang: "en", targetLang: "es" });
        ws.emit("message", Buffer.from(initMsg), false);

        expect(ws.session.isReady).toBe(true);
        expect(ws.sentMessages).toContainEqual({ type: "ready" });
    });

    test("sends error if sourceLang is missing", () => {
        const ws = makeMockWs();
        handleConnection(ws);

        const initMsg = JSON.stringify({ type: "init", targetLang: "es" });
        ws.emit("message", Buffer.from(initMsg), false);

        expect(ws.session.isReady).toBe(false);
        expect(ws.sentMessages[0].type).toBe("error");
    });

    test("sends error if targetLang is missing", () => {
        const ws = makeMockWs();
        handleConnection(ws);

        const initMsg = JSON.stringify({ type: "init", sourceLang: "en" });
        ws.emit("message", Buffer.from(initMsg), false);

        expect(ws.session.isReady).toBe(false);
        expect(ws.sentMessages[0].type).toBe("error");
    });
});

describe("processAudio guard", () => {
    test("sends error if audio arrives before init", () => {
        const ws = makeMockWs();
        handleConnection(ws);

        // send binary before init
        ws.emit("message", Buffer.from("fake audio"), true);

        expect(ws.sentMessages[0].type).toBe("error");
        expect(ws.sentMessages[0].message).toMatch(/ready/i);
    });
});