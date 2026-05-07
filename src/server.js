const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const readline = require("readline");
const http = require("http");
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
            console.log("[pipeline response]", line); const response = JSON.parse(line);
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

function runTextPipeline(text, sourceLang, targetLang) {
    return new Promise((resolve, reject) => {
        if (!pipelineState.ready) return reject(new Error('Pipeline not ready'));

        pipelineState.pendingResolvers.push((response) => {
            if (response.status === 'ok') resolve(response);
            else reject(new Error(response.error));
        });

        pipelineState.process.stdin.write(JSON.stringify({
            text: text,
            source_lang: sourceLang,
            target_lang: targetLang
        }) + '\n');
    });
}

startPipeline().then(() => {
    const server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/translate-text') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { text, sourceLang, targetLang } = JSON.parse(body);
                    const result = await runTextPipeline(text, sourceLang, targetLang);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ translation: result.translation }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    const wss = new WebSocketServer({ server });
    wss.on('connection', (ws) => handleConnection(ws, runPipeline));

    server.listen(8080, () => {
        console.log("Running server on ws://localhost:8080");
        console.log("HTTP endpoint: http://localhost:8080/translate-text");
    });
});
