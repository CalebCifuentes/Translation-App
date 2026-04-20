const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const readline = require("readline");
const { handleConnection } = require("../src/socket/handler");

const pipelineState = {
    process: null,
    ready: false,
    pendingResolvers: []
};

function startPipeline() {
    return new Promise((resolve) => {
        pipelineState.process = spawn('python3', ['pipeline.py']);

        const rl = readline.createInterface({ input: pipelineState.process.stdout });

        rl.on('line', (line) => {
            const response = JSON.parse(line);
            const resolver = pipelineState.pendingResolvers.shift();
            if (resolver) resolver(response);
        });

        pipelineState.process.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            console.error(`[pipeline] ${msg}`);
            if (msg.includes('Pipeline ready')) {
                pipelineState.ready = true;
                resolve();
            }
        });

        pipelineState.process.on('close', (code) => {
            console.error(`[pipeline] process exited with code ${code}`);
            pipelineState.ready = false;
        });
    });
}

function runPipeline(audioFile, sourceLang, targetLang, outputFile) {
    return new Promise((resolve, reject) => {
        if (!pipelineState.ready) return reject(new Error('Pipeline not ready'));

        pipelineState.pendingResolvers.push((response) => {
            if (response.status === 'ok') resolve(response);
            else reject(new Error(response.error));
        });

        pipelineState.process.stdin.write(JSON.stringify({
            audio_file: audioFile,
            source_lang: sourceLang,
            target_lang: targetLang,
            output_file: outputFile
        }) + '\n');
    });
}

startPipeline().then(() => {
    const wss = new WebSocketServer({ port: 8080 });
    wss.on('connection', (ws) => handleConnection(ws, runPipeline));
    console.log("Running server on ws://localhost:8080");
});