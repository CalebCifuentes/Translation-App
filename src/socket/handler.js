const fs = require("fs");

const {convertToWav} = require("../audio/converter");
//const { translate} = require("../pipeline/translator");

//sets up the server and the session
// the session has an ID, the audioChuncks, source language
//target language, startTime

function handleConnection(ws){
     ws.session = {
        id: crypto.randomUUID(),
        sourceLang: "",
        targetLang: "",
        startTime: Date.now(),
        isReady: false, // flag for init messages
        isProcessing: false // flag to prevent two audio chucnks writing to same file path
    };
    console.log("Session made", ws.session.id);


    //init messages 
    ws.on("message", (data, isBinary) =>  {
        if(isBinary){
            processAudio(ws, data);
        } else {
        try {
            const msg = JSON.parse(data.toString());
            handleMessages(ws, msg);
        } catch(e){
            console.error("BAD JSON", e.message)
        }
      }
    });

    ws.on("close", () => {
        console.log("Session Closed:", ws.session.id);
        ws.session = null
    });

    ws.on("error", (err) => {
        console.log("socket error:", err);
    });

}

function handleMessages(ws, msg){
    if(msg.type === "init"){
        // notifies that there needs to be a source and target
        if(!msg.sourceLang || !msg.targetLang){
            ws.send(JSON.stringify({type:"error", message: "source and target language are needed"}));
            return;
        }
        ws.session.sourceLang = msg.sourceLang;
        ws.session.targetLang = msg.targetLang;
        ws.session.isReady = true;
        console.log(`Languages that are set are ${msg.sourceLang} --> ${msg.targetLang}`);
        ws.send(JSON.stringify({type: "ready"}));
    } else {
        console.warn("Unkown message type:", msg.type);
    }
}

//processing the full audio
async function processAudio(ws, data){
    const rawPath = `temp/raw/${ws.session.id}.m4a`;

    //Lets make sure the directory exits before anything
    fs.mkdirSync("temp/raw", {recursive:true});
    fs.mkdirSync("temp/converted", {recursive:true});

    // should make sure init messages go first
    //then sends 'ready' for audio
    if(!ws.session.isReady){
        ws.send(JSON.stringify({
            type: "error",
            message: "Need to wait for 'ready' to send audio"
        }))
        return; // stops processing
    }

    //Notifies if two audio blobs are processing at the same time
    if(!ws.session.isProcessing){
        ws.send(JSON.stringify({type: "error", message:"Audio already processing, two audio chuncks " +
            "are tyring to write to the same file path"}));
        return;
    }
    ws.session.isProcessing = true;
    fs.writeFileSync(rawPath, data);
    console.log("Saved raw audio", rawPath);


    try {
        const wavPath = await convertToWav(rawPath, ws.session.id);
        //Deletes raw file for cleanup
        fs.unlinkSync(rawPath) 
        console.log("WAV Converted:", wavPath)
        // Hand off the NLP 
        //const result = await translate(wavPath, ws.session.sourceLang, ws.session.targetLang);
        //ws.send(JSON.stringify({type: "translation", text: result}))
    } catch (err) {
        console.error("Processing failed", err.message);
        ws.send(JSON.stringify({type: "error", message: "Audio Processing Failed"}))
    } finally {
        ws.session.isProcessing = false // resets, after errors too
    }
}


module.exports = {handleConnection};