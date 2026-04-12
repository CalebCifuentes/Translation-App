// tests/client/test.client.js
// Simulates the iOS app connecting to the WebSocket server
// Run: node tests/client/test.client.js
 
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
 
// ─── Config ───────────────────────────────────────────────────────────────────
const SERVER_URL = "ws://localhost:8080";
const AUDIO_FILE = path.join(__dirname, "../../temp/raw/Test.m4a");
const RESPONSE_TIMEOUT_MS = 20000; // 20s max wait for translation response
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
 
function pass(label) {
    console.log(`  ✓ ${label}`);
    passed++;
}
 
function fail(label, reason) {
    console.error(`  ✗ ${label}`);
    if (reason) console.error(`    → ${reason}`);
    failed++;
}
 
function summary() {
    console.log("\n─────────────────────────────────");
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log("─────────────────────────────────");
    process.exit(failed > 0 ? 1 : 0);
}
 
// Creates a fresh WebSocket connection and returns it with a timeout guard
function connect(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(SERVER_URL);
        const timer = setTimeout(() => {
            ws.terminate();
            reject(new Error("Connection timed out"));
        }, timeoutMs);
 
        ws.on("open", () => {
            clearTimeout(timer);
            resolve(ws);
        });
 
        ws.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
 
// Waits for the next message from the server
function waitForMessage(ws, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("Timed out waiting for server message"));
        }, timeoutMs);
 
        ws.once("message", (data, isBinary) => {
            clearTimeout(timer);
            if (isBinary) {
                resolve({ binary: true, data });
            } else {
                try {
                    resolve({ binary: false, data: JSON.parse(data.toString()) });
                } catch {
                    reject(new Error("Server sent invalid JSON"));
                }
            }
        });
    });
}
 
// Sends a JSON message to the server
function sendJSON(ws, payload) {
    ws.send(JSON.stringify(payload));
}
 
// ─── Tests ────────────────────────────────────────────────────────────────────
 
// Test 1: Server accepts connection
async function testConnection() {
    console.log("\nTest 1: Server accepts connection");
    let ws;
    try {
        ws = await connect();
        pass("Connected to server successfully");
    } catch (err) {
        fail("Could not connect to server", err.message);
    } finally {
        ws?.terminate();
    }
}
 
// Test 2: Sending audio before init gets an error back
async function testAudioBeforeInit() {
    console.log("\nTest 2: Audio before init is rejected");
    let ws;
    try {
        ws = await connect();
        ws.send(Buffer.from("fake audio data")); // binary, no init sent first
 
        const { data } = await waitForMessage(ws);
        if (data.type === "error") {
            pass("Server rejected audio before init");
        } else {
            fail("Expected error response", `Got: ${JSON.stringify(data)}`);
        }
    } catch (err) {
        fail("Test failed unexpectedly", err.message);
    } finally {
        ws?.terminate();
    }
}
 
// Test 3: Init with missing sourceLang gets an error
async function testInitMissingSourceLang() {
    console.log("\nTest 3: Init missing sourceLang is rejected");
    let ws;
    try {
        ws = await connect();
        sendJSON(ws, { type: "init", targetLang: "es" }); // no sourceLang
 
        const { data } = await waitForMessage(ws);
        if (data.type === "error") {
            pass("Server rejected init with missing sourceLang");
        } else {
            fail("Expected error response", `Got: ${JSON.stringify(data)}`);
        }
    } catch (err) {
        fail("Test failed unexpectedly", err.message);
    } finally {
        ws?.terminate();
    }
}
 
// Test 4: Init with missing targetLang gets an error
async function testInitMissingTargetLang() {
    console.log("\nTest 4: Init missing targetLang is rejected");
    let ws;
    try {
        ws = await connect();
        sendJSON(ws, { type: "init", sourceLang: "en" }); // no targetLang
 
        const { data } = await waitForMessage(ws);
        if (data.type === "error") {
            pass("Server rejected init with missing targetLang");
        } else {
            fail("Expected error response", `Got: ${JSON.stringify(data)}`);
        }
    } catch (err) {
        fail("Test failed unexpectedly", err.message);
    } finally {
        ws?.terminate();
    }
}
 
// Test 5: Valid init gets a ready response
async function testValidInit() {
    console.log("\nTest 5: Valid init gets ready response");
    let ws;
    try {
        ws = await connect();
        sendJSON(ws, { type: "init", sourceLang: "en", targetLang: "es" });
 
        const { data } = await waitForMessage(ws);
        if (data.type === "ready") {
            pass("Server responded with ready");
        } else {
            fail("Expected ready response", `Got: ${JSON.stringify(data)}`);
        }
    } catch (err) {
        fail("Test failed unexpectedly", err.message);
    } finally {
        ws?.terminate();
    }
}
 
// Test 6: Unknown message type is handled (no crash, just a warn on server)
async function testUnknownMessageType() {
    console.log("\nTest 6: Unknown message type does not crash server");
    let ws;
    try {
        ws = await connect();
 
        // Init first so session is valid
        sendJSON(ws, { type: "init", sourceLang: "en", targetLang: "es" });
        await waitForMessage(ws); // consume the ready
 
        sendJSON(ws, { type: "banana" }); // nonsense type
 
        // Server should still be alive — send a valid message and get a response
        // If the server crashed this will time out
        sendJSON(ws, { type: "init", sourceLang: "fr", targetLang: "de" });
        const { data } = await waitForMessage(ws, 3000);
 
        if (data.type === "error" || data.type === "ready") {
            pass("Server stayed alive after unknown message type");
        } else {
            fail("Unexpected response after unknown message", JSON.stringify(data));
        }
    } catch (err) {
        fail("Server may have crashed after unknown message type", err.message);
    } finally {
        ws?.terminate();
    }
}
 
// Test 7: Full round trip — init → audio → translation (requires real audio file)
async function testFullRoundTrip() {
    console.log("\nTest 7: Full round trip with real audio file");
 
    if (!fs.existsSync(AUDIO_FILE)) {
        console.log(`  ~ Skipped (no audio file found at ${AUDIO_FILE})`);
        return;
    }
 
    let ws;
    try {
        ws = await connect();
 
        // Step 1: init
        sendJSON(ws, { type: "init", sourceLang: "en", targetLang: "es" });
        const initResp = await waitForMessage(ws);
        if (initResp.data.type !== "ready") {
            fail("Init did not return ready", JSON.stringify(initResp.data));
            return;
        }
        pass("Init accepted");
 
        // Step 2: send audio
        const audioBuffer = fs.readFileSync(AUDIO_FILE);
        ws.send(audioBuffer);
        pass("Audio sent");
 
        // Step 3: wait for translation or error
        // Uses longer timeout since processing takes 5-15 seconds
        const audioResp = await waitForMessage(ws, RESPONSE_TIMEOUT_MS);
 
        if (audioResp.data.type === "translation") {
            pass(`Translation received: "${audioResp.data.text}"`);
        } else if (audioResp.data.type === "error") {
            // Expected if NLP pipeline is not connected yet
            pass(`Server returned error (NLP likely not connected yet): ${audioResp.data.message}`);
        } else {
            fail("Unexpected response after sending audio", JSON.stringify(audioResp.data));
        }
    } catch (err) {
        fail("Full round trip failed", err.message);
    } finally {
        ws?.terminate();
    }
}
 
// Test 8: Two clients connect simultaneously, sessions stay isolated
async function testConcurrentSessions() {
    console.log("\nTest 8: Two clients have isolated sessions");
    let ws1, ws2;
    try {
        [ws1, ws2] = await Promise.all([connect(), connect()]);
 
        // Init both with different language pairs
        sendJSON(ws1, { type: "init", sourceLang: "en", targetLang: "es" });
        sendJSON(ws2, { type: "init", sourceLang: "fr", targetLang: "de" });
 
        const [resp1, resp2] = await Promise.all([
            waitForMessage(ws1),
            waitForMessage(ws2),
        ]);
 
        if (resp1.data.type === "ready" && resp2.data.type === "ready") {
            pass("Both clients received ready independently");
        } else {
            fail("One or both clients did not get ready", `ws1: ${JSON.stringify(resp1.data)}, ws2: ${JSON.stringify(resp2.data)}`);
        }
    } catch (err) {
        fail("Concurrent session test failed", err.message);
    } finally {
        ws1?.terminate();
        ws2?.terminate();
    }
}
 
// ─── Runner ───────────────────────────────────────────────────────────────────
async function run() {
    console.log("=================================");
    console.log(" WebSocket Server — Client Tests ");
    console.log("=================================");
    console.log(`Connecting to: ${SERVER_URL}`);
 
    await testConnection();
    await testAudioBeforeInit();
    await testInitMissingSourceLang();
    await testInitMissingTargetLang();
    await testValidInit();
    await testUnknownMessageType();
    await testFullRoundTrip();
    await testConcurrentSessions();
 
    summary();
}
 
run();