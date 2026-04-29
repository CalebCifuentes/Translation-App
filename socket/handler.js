const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { convertToWav } = require("../audio/converter");

function handleConnection(ws, runPipeline) {
    ws.session = {
        id: crypto.randomUUID(),
        sourceLang: "",
        targetLang: "",
        startTime: Date.now(),
        isReady: false,
        isProcessing: false,
    };
    console.log("Session made:", ws.session.id);

    ws.on("message", (data, isBinary) => {
        if (isBinary) {
            //sets 10MB limit for audio
            if(data.length > 10 * 1024 * 1024){
                ws.send(JSON.stringify({type: 'error', message:'Audio too large' }));
                return;
            }

            processAudio(ws, data, runPipeline);
        } else {
            try {
                const msg = JSON.parse(data.toString());
                handleMessages(ws, msg, runPipeline);
            } catch (e) {
                console.error("BAD JSON:", e.message);
            }
        }
    });

    ws.on("close", () => {
        console.log("Session Closed:", ws.session.id);
        ws.session = null;
    });

    ws.on("error", (err) => {
        console.log("Socket error:", err);
    });
}

async function handleMessages(ws, msg, runPipeline) {
    if (msg.type === "init") {
        if (!msg.sourceLang || !msg.targetLang) {
            ws.send(
                JSON.stringify({
                    type: "error",
                    message: "source and target language are needed",
                })
            );
            return;
        }  
        ws.session.sourceLang = msg.sourceLang;
        ws.session.targetLang = msg.targetLang;
        ws.session.isReady = true;
        console.log(`Languages set: ${msg.sourceLang} --> ${msg.targetLang}`);
        ws.send(JSON.stringify({ type: "ready" }));
    }  else if(msg.type === "text"){
        if (!ws.session.isReady) {
            ws.send(JSON.stringify({ type: "error", message: "Session not ready" }));
            return;
        }
        if (ws.session.isProcessing) {
            ws.send(JSON.stringify({ type: "error", message: "Already processing, please wait" }));
            return;
        }

        ws.session.isProcessing = true;
        try {
            const result = await runPipeline(
                null,                    // pass text directly
                ws.session.sourceLang,
                ws.session.targetLang,
                null,
                msg.text                        // no audio output needed for text
            );
            ws.send(JSON.stringify({
                type: "translation",
                transcription: msg.text,
                translation: result.translation,
                detected_lang: result.detected_lang,
                confidence: result.confidence,
                audio: result.audio ?? null,
            }));
        } catch (err) {
            console.error("Text translation failed:", err.message);
            ws.send(JSON.stringify({ type: "error", message: "Translation failed" }));
        } finally {
            ws.session.isProcessing = false;
        }
    }else {
        console.warn("Unknown message type:", msg.type);
    }
}


async function processAudio(ws, data, runPipeline) {
    const rawDir = path.join(__dirname, "../temp/raw");
    const rawPath = path.join(rawDir, `${ws.session.id}.m4a`);
    const outputDir = path.join(__dirname, "../temp/translated");
    const outputPath = path.join(outputDir, `${ws.session.id}_out.mp3`);

    fs.mkdirSync(rawDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    if (!ws.session.isReady) {
        ws.send(
            JSON.stringify({
                type: "error",
                message: "Need to wait for 'ready' before sending audio",
            })
        );
        return;
    }

    if (ws.session.isProcessing) {
        ws.send(
            JSON.stringify({
                type: "error",
                message: "Already processing audio, please wait",
            })
        );
        return;
    }

    ws.session.isProcessing = true;
    fs.writeFileSync(rawPath, data);

    try {
        // Step 1: Convert m4a to wav
        const wavPath = await convertToWav(rawPath, ws.session.id);
        fs.unlinkSync(rawPath);
        console.log("Converted to WAV:", wavPath);

        // Step 2: Run transcription, translation, and TTS through Python pipeline
        const result = await runPipeline(
            wavPath,
            ws.session.sourceLang,
            ws.session.targetLang,
            outputPath
        );
        console.log(sourceLang);
        console.log(targetLang);
        // Step 3: Read the output mp3 and encode as base64 so the iPhone can play it
        const audioBuffer = fs.readFileSync(outputPath);
        const audioBase64 = audioBuffer.toString("base64");

        // Step 4: Clean up temp files
        fs.unlinkSync(wavPath);
        fs.unlinkSync(outputPath);

        // Step 5: Send everything back to the iPhone
        ws.send(
            JSON.stringify({
                type: "translation",
                transcription: result.transcription,
                translation: result.translation,
                detected_lang: result.detected_lang,
                confidence: result.confidence,
                audio: audioBase64, // iPhone decodes this and plays it directly
            })
        );
    } catch (err) {
        console.error("Processing failed:", err.message);
        ws.send(
            JSON.stringify({
                type: "error",
                message: "Audio processing failed",
            })
        );
    } finally {
        ws.session.isProcessing = false;
    }
}

module.exports = { handleConnection };
