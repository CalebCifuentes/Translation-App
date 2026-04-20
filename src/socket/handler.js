const fs = require("fs");
const { convertToWav } = require("../audio/converter");

function handleConnection(ws, runPipeline) {
    ws.session = {
        id: crypto.randomUUID(),
        sourceLang: "",
        targetLang: "",
        startTime: Date.now(),
        isReady: false,
        isProcessing: false
    };
    console.log("Session made", ws.session.id);

    ws.on("message", (data, isBinary) => {
        if (isBinary) {
            processAudio(ws, data, runPipeline);
        } else {
            try {
                const msg = JSON.parse(data.toString());
                handleMessages(ws, msg);
            } catch (e) {
                console.error("BAD JSON", e.message);
            }
        }
    });

    ws.on("close", () => {
        console.log("Session Closed:", ws.session.id);
        ws.session = null;
    });

    ws.on("error", (err) => {
        console.log("socket error:", err);
    });
}

function handleMessages(ws, msg) {
    if (msg.type === "init") {
        if (!msg.sourceLang || !msg.targetLang) {
            ws.send(JSON.stringify({ type: "error", message: "source and target language are needed" }));
            return;
        }
        ws.session.sourceLang = msg.sourceLang;
        ws.session.targetLang = msg.targetLang;
        ws.session.isReady = true;
        console.log(`Languages that are set are ${msg.sourceLang} --> ${msg.targetLang}`);
        ws.send(JSON.stringify({ type: "ready" }));
    } else {
        console.warn("Unknown message type:", msg.type);
    }
}

async function processAudio(ws, data, runPipeline) {
    const rawPath = `temp/raw/${ws.session.id}.m4a`;
    const outputPath = `temp/converted/${ws.session.id}_out.mp3`;

    fs.mkdirSync("temp/raw", { recursive: true });
    fs.mkdirSync("temp/converted", { recursive: true });

    if (!ws.session.isReady) {
        ws.send(JSON.stringify({ type: "error", message: "Need to wait for 'ready' to send audio" }));
        return;
    }

    if (ws.session.isProcessing) {
        ws.send(JSON.stringify({ type: "error", message: "Audio already processing, two audio chunks are trying to write to the same file path" }));
        return;
    }

    ws.session.isProcessing = true;
    fs.writeFileSync(rawPath, data);
    console.log("Saved raw audio", rawPath);

    try {
        const wavPath = await convertToWav(rawPath, ws.session.id);
        fs.unlinkSync(rawPath);
        console.log("WAV Converted:", wavPath);

        const result = await runPipeline(
            wavPath,
            ws.session.sourceLang,
            ws.session.targetLang,
            outputPath
        );

        ws.send(JSON.stringify({
            type: "translation",
            transcription: result.transcription,
            translation: result.translation,
            output_file: result.output_file,
            detected_lang: result.detected_lang
        }));

    } catch (err) {
        console.error("Processing failed", err.message);
        ws.send(JSON.stringify({ type: "error", message: "Audio Processing Failed" }));
    } finally {
        ws.session.isProcessing = false;
    }
}

module.exports = { handleConnection };
