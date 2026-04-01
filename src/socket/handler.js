const fs = require("fs");

const {convertToWav} = require("../audio/converter");
//const { translate} = require("../pipeline/translator");

//sets up the server and the session
// the session has an ID, the audioChuncks, source language
//target language, startTime, and bool value for recording
WebSocketServer.on("connection", (ws) =>{
    ws.session = {
        id: crypto.randomUUID(),
        sourceLang: "",
        targetLang: "",
        startTime: Date.now()
    };
    console.log("Session made", ws.session.id);
});

//init messages 
ws.on("message", (data, isBinary) =>  {
    if(isBinary){
        processAudio(ws, data);
    } else {
       try{
        const msg = JSON.parse(data.toString());
        handleMessages(ws, msg);
       } catch(e){
        console.error("BAD JSON", e.message)
       }
    }
});

ws.on("close", () => {
    console.log("Session Closed", ws.session.id);
});

ws.on("error", (err) => {
    console.log("socket error:", err);
});


function handleMessages(ws, msg){
    if(msg === 'init'){
        ws.session.sourceLang = msg.sourceLang;
        ws.session.targetLang = msg.targetLang;
        console.log(`Languages that are set are ${msg.targetLang} and ${msg.sourceLang}`);
        ws.send(JSON.stringify({type: "ready"}));
    }
}

//processing the full audio
async function processAudio(ws){
    const filePath =   `temp/raw/${ws.session.id}.m4a`;
    fs.writeFileSync(filePath, data);
    console.log("Audio Saved:", filePath);
}



// section for NLP 


//cleaning up the session
ws.on("close", () => {
    console.log("Session Closed:", ws.session.id);
    ws.session.audioChunks = null;
});


module.exports = {handleConnection};