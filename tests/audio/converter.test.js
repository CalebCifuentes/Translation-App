const path = require("path");
const fs = require("fs");
const { convertToWav } = require("../../src/audio/converter");

describe("convertToWav", () => {
    const sessionId = "test-session";
    const outputPath = path.join(__dirname, "../../temp/converted", `${sessionId}.wav`);

    afterEach(() => {
        // clean up output file after each test
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    });

    test("converts m4a to wav and returns the output path", async () => {
        const inputPath = path.join(__dirname, "../../temp/raw/Test.m4a");
        const result = await convertToWav(inputPath, sessionId);
        expect(result).toBe(outputPath);
        expect(fs.existsSync(outputPath)).toBe(true);
    });

    test("rejects if input file does not exist", async () => {
        await expect(convertToWav("fake/path.m4a", sessionId)).rejects.toThrow();
    });
});