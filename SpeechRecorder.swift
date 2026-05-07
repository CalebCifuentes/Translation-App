//
//  SpeechRecorder.swift
//  TranslatorApp
//
//  Created by Noah Kifle on 4/21/26.
//

import AVFoundation
import Combine


class SpeechRecorder: NSObject, ObservableObject {

    @Published var isRecording: Bool = false

    private var engine = AVAudioEngine()
    private var file: AVAudioFile?

    // Replace the tempURL computed property with:
    private var tempURL = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString + ".m4a")
    
    func startRecording() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [])
        try session.setActive(true)

        let input = engine.inputNode
        let hwFormat = input.outputFormat(forBus: 0)  // use hardware's actual format

        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: hwFormat.sampleRate,      // match hardware rate
            AVNumberOfChannelsKey: hwFormat.channelCount
        ]
        
        // Generate a fresh URL each recording so stale data is never read back
        tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + ".m4a")
        
        file = try AVAudioFile(forWriting: tempURL, settings: settings)

        input.installTap(onBus: 0, bufferSize: 4096, format: hwFormat) { [weak self] buf, _ in
            try? self?.file?.write(from: buf)
        }
        try engine.start()
        isRecording = true
    }
    

    func stopRecording() -> Data? {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        file = nil
        isRecording = false
        return try? Data(contentsOf: tempURL)
    }
}
