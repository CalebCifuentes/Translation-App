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

    private var tempURL: URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("recording.m4a")
    }

    func startRecording() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement)
        try session.setActive(true)

        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1
        ]
        file = try AVAudioFile(forWriting: tempURL, settings: settings)

        let input = engine.inputNode
        input.installTap(onBus: 0, bufferSize: 4096,
                         format: input.outputFormat(forBus: 0)) { [weak self] buf, _ in
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
