const ffmpeg = require("fluent-ffmpeg")
const path = require("path");

function convertToWav(inputPath, sessionId){
    return new Promise((resolve, reject) => {
        const outputPath = path.join(__dirname, "../../temp/converted", `${sessionId}.mp3`)
        ffmpeg(inputPath)
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
