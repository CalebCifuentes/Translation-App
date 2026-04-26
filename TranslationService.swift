//
//  TranslationService.swift
//  TranslatorApp
//
//  Created by Noah Kifle on 4/21/26.
//

import Foundation
import AVFoundation
import Combine

// MARK: — Message Types (mirror your Node.js protocol)
struct InitMessage: Encodable {
    let type = "init"
    let sourceLang: String
    let targetLang: String
}

struct TranslationResponse: Decodable {
    let type: String
    let transcription: String?
    let translation: String?
    let detectedLang: String?
    let message: String?
    let audio: String?

    enum CodingKeys: String, CodingKey {
        case type, transcription, translation, message, audio
        case detectedLang = "detected_lang"
    }
}

// MARK: — Service
@MainActor
class TranslationService: NSObject, ObservableObject {

    // ── Published state ──────────────────────────────────────────────
    @Published var translatedText: String = ""
    @Published var transcribedText: String = ""
    @Published var isConnected: Bool = false
    @Published var isProcessing: Bool = false
    @Published var isSpeaking: Bool = false
    @Published var errorMessage: String? = nil

    // ── Internal ──────────────────────────────────────────────────────
    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession!
    private var isReady = false
    private var pendingAudioData: Data?
    private var audioPlayer: AVAudioPlayer?

    // ── Config ────────────────────────────────────────────────────────
    // Use your Mac's LAN IP when testing on a real iPhone (not localhost)
    // Find it by running: ipconfig getifaddr en0
    private let serverURL = URL(string: "wss://translation-app-production-d9dc.up.railway.app")!

    override init() {
        super.init()
        session = URLSession(configuration: .default,
                             delegate: self,
                             delegateQueue: OperationQueue())
    }

    // MARK: Connect / Disconnect
    func connect(sourceLang: String, targetLang: String) {
        disconnect()
        isReady = false
        webSocketTask = session.webSocketTask(with: serverURL)
        webSocketTask?.resume()
        listenForMessages()
        sendInit(sourceLang: sourceLang, targetLang: targetLang)
    }

    func disconnect() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
        isReady = false
    }

    // MARK: Send Init
    private func sendInit(sourceLang: String, targetLang: String) {
        let msg = InitMessage(sourceLang: sourceLang, targetLang: targetLang)
        guard let data = try? JSONEncoder().encode(msg),
              let json = String(data: data, encoding: .utf8) else { return }

        webSocketTask?.send(.string(json)) { [weak self] error in
            if let error { self?.handleError(error) }
        }
    }

    // MARK: Send Audio
    func sendAudio(_ audioData: Data) {
        guard isReady else {
            pendingAudioData = audioData
            return
        }
        isProcessing = true
        webSocketTask?.send(.data(audioData)) { [weak self] error in
            if let error { self?.handleError(error) }
        }
    }

    // MARK: Translate Plain Text (text-only fallback)
    func translateText(_ text: String,
                       from source: String,
                       to target: String) async {
        // Placeholder — replace with HTTP endpoint if you add one
        translatedText = "[Translated] \(text)"
    }

    // MARK: Play Audio
    func playAudio(_ data: Data) {
        do {
            audioPlayer = try AVAudioPlayer(data: data)
            audioPlayer?.delegate = self
            audioPlayer?.play()
            isSpeaking = true
        } catch {
            errorMessage = "Audio playback failed: \(error.localizedDescription)"
        }
    }

    // MARK: Listen for Messages
    private func listenForMessages() {
        webSocketTask?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let error):
                Task { @MainActor in self.handleError(error) }
            case .success(let message):
                Task { @MainActor in self.handleMessage(message) }
                self.listenForMessages()
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .string(let text):
            guard let data = text.data(using: .utf8),
                  let response = try? JSONDecoder().decode(TranslationResponse.self,
                                                           from: data)
            else { return }

            switch response.type {
            case "ready":
                isReady = true
                if let pending = pendingAudioData {
                    pendingAudioData = nil
                    sendAudio(pending)
                }
            case "translation":
                isProcessing = false
                translatedText  = response.translation ?? ""
                transcribedText = response.transcription ?? ""
                if let audioBase64 = response.audio,
                   let audioData = Data(base64Encoded: audioBase64) {
                    playAudio(audioData)
                }
            case "error":
                isProcessing = false
                errorMessage = response.message
            default:
                break
            }

        case .data:
            break
        @unknown default:
            break
        }
    }

    private func handleError(_ error: Error) {
        isProcessing = false
        errorMessage = error.localizedDescription
        isConnected = false
    }
}

// MARK: — URLSessionWebSocketDelegate
extension TranslationService: URLSessionWebSocketDelegate {
    nonisolated func urlSession(_ session: URLSession,
                     webSocketTask: URLSessionWebSocketTask,
                     didOpenWithProtocol protocol: String?) {
        Task { @MainActor in self.isConnected = true }
    }

    nonisolated func urlSession(_ session: URLSession,
                     webSocketTask: URLSessionWebSocketTask,
                     didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
                     reason: Data?) {
        Task { @MainActor in
            self.isConnected = false
            self.isReady = false
        }
    }
}

// MARK: — AVAudioPlayerDelegate
extension TranslationService: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        isSpeaking = false
    }
}
