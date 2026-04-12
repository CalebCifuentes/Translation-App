const {WebSocketServer} = require("ws");
//const{handleConnection} = require("../src/socket/handler")
const wss = new WebSocketServer({port: 8080});
// wss.on('connection', handleConnection);

wss.on('connection', function connection(ws){
    console.log("Client Connected");
    ws.on('message', function message(data){
        console.log('received: %s', data);
    });
    ws.on("close", () => { 
        console.log("Client disconnected");
    });
    ws.on("error",(err) => {
        console.log("Error", err)
    });
   // ws.send('something');
});
console.log("Running server on ws://localhost:8080");