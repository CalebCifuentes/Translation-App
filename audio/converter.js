const ffmpeg = require("fluent-ffmpeg")
const path = require("path");
const fs = require("fs");

function convertToWav(inputPath, sessionId){
    return new Promise((resolve, reject) => {
        const outputDir = path.join(__dirname, "../temp/convertedToWav");
        const outputPath = path.join(outputDir, `${sessionId}.wav`);
        
        fs.mkdirSync(outputDir, {recursive: true});

        ffmpeg(inputPath)
        .inputFormat("m4a")
        .audioFrequency(16000)
        .audioChannels(1)
        .audioCodec("pcm_s16le")
        .toFormat("wav")
        .on("end", () =>{
            console.log(`Converted: ${sessionId}`);
            resolve(outputPath)
        })
        .on("error", (err) =>{
            console.error( `Conversion failed for ${sessionId}:`, err);
            reject(err);
        })
        .save(outputPath);

    });
}
module.exports = {convertToWav}
