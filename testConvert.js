// test-converter.js
const { convertToWav } = require("./src/audio/converter");
const path = require("path");

const inputPath = path.join(__dirname,"temp","raw", "Test.m4a");
const sessionId = "test-session-1";

console.log("Starting conversion...");

convertToWav(inputPath, sessionId)
  .then((outputPath) => {
    console.log("Success! WAV file at:", outputPath);
  })
  .catch((err) => {
    console.error("Failed:", err.message);
  });


/*
const ffmpeg = require("fluent-ffmpeg")
const path = require("path");

const input = path.join(__dirname, "Test.m4a");
const output = path.join(__dirname, "Test.wav");

ffmpeg(input)
.toFormat("wav")
.on("end",() =>{
    console.log("Done with conversion");
})
.on("error", (err) =>{
    console.error("Something went wrong:", err);
})
.save(output)
*/