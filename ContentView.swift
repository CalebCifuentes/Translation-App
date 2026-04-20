//
//  ContentView.swift
//  TranslatorApp
//
//  Created by Noah Kifle on 3/10/26.
//

import SwiftUI

// MARK: — Settings Model
struct AppSettings {
    var colorScheme: ColorSchemePreference = .system
    var fontSize: FontSizePreference = .medium
    var autoTranslate: Bool = false
    var hapticFeedback: Bool = true
    var showCharacterCount: Bool = true
    var defaultSourceLanguage: String = "English"
    var defaultTargetLanguage: String = "Uzbek"
    var transliterationEnabled: Bool = false
}

enum ColorSchemePreference: String, CaseIterable {
    case system = "System"
    case light = "Light"
    case dark = "Dark"

    var colorScheme: ColorScheme? {
        switch self {
        case .light: return .light
        case .dark: return .dark
        case .system: return nil
        }
    }
}

enum FontSizePreference: String, CaseIterable {
    case small = "Small"
    case medium = "Medium"
    case large = "Large"

    var size: CGFloat {
        switch self {
        case .small: return 14
        case .medium: return 16
        case .large: return 19
        }
    }
}

// MARK: — Settings Sheet View
struct SettingsView: View {
    @Binding var settings: AppSettings
    let languages: [String]
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            List {

                // MARK: Appearance
                Section {
                    HStack {
                        Label("Theme", systemImage: "circle.lefthalf.filled")
                        Spacer()
                        Picker("", selection: $settings.colorScheme) {
                            ForEach(ColorSchemePreference.allCases, id: \.self) {
                                Text($0.rawValue)
                            }
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 190)
                    }

                    HStack {
                        Label("Font Size", systemImage: "textformat.size")
                        Spacer()
                        Picker("", selection: $settings.fontSize) {
                            ForEach(FontSizePreference.allCases, id: \.self) {
                                Text($0.rawValue)
                            }
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 190)
                    }
                } header: {
                    Text("Appearance")
                }

                // MARK: Translation
                Section {
                    Toggle(isOn: $settings.autoTranslate) {
                        Label("Auto-Translate", systemImage: "bolt.fill")
                    }
                    Toggle(isOn: $settings.transliterationEnabled) {
                        Label("Show Transliteration", systemImage: "character.phonetic")
                    }
                    HStack {
                        Label("Default From", systemImage: "arrow.right.circle")
                        Spacer()
                        Picker("", selection: $settings.defaultSourceLanguage) {
                            ForEach(languages, id: \.self) { lang in
                                Text(lang).tag(lang)
                            }
                        }
                        .pickerStyle(.menu)
                    }
                    HStack {
                        Label("Default To", systemImage: "arrow.left.circle")
                        Spacer()
                        Picker("", selection: $settings.defaultTargetLanguage) {
                            ForEach(languages, id: \.self) { lang in
                                Text(lang).tag(lang)
                            }
                        }
                        .pickerStyle(.menu)
                    }
                } header: {
                    Text("Translation")
                }

                // MARK: Input & Feedback
                Section {
                    Toggle(isOn: $settings.showCharacterCount) {
                        Label("Character Count", systemImage: "number")
                    }
                    Toggle(isOn: $settings.hapticFeedback) {
                        Label("Haptic Feedback", systemImage: "iphone.radiowaves.left.and.right")
                    }
                } header: {
                    Text("Input & Feedback")
                }

                // MARK: About
                Section {
                    HStack {
                        Label("Version", systemImage: "info.circle")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }
                    Link(destination: URL(string: "https://example.com/privacy")!) {
                        Label("Privacy Policy", systemImage: "hand.raised")
                    }
                    Link(destination: URL(string: "mailto:support@example.com")!) {
                        Label("Send Feedback", systemImage: "envelope")
                    }
                } header: {
                    Text("About")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
    }
}

// MARK: — Main Content View
struct ContentView: View {
    @State private var sourceText: String = ""
    @State private var translatedText: String = ""
    @State private var sourceLanguage: String = "English"
    @State private var targetLanguage: String = "Uzbek"
    @State private var isRecordingSource = false
    @State private var swapRotation: Double = 0
    @State private var isSpeaking = false
    @State private var isSaved = false
    @State private var showSettings = false
    @State private var settings = AppSettings()

    let languages = ["English", "Spanish", "Uzbek", "Amharic"]
    let maxCharacters = 1000

    var body: some View {
        ZStack {
            Color(.systemGroupedBackground)
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 14) {

                    // MARK: — Header
                    ZStack {
                        Text("Translator")
                            .font(.title2)
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity, alignment: .center)

                        HStack {
                            Spacer()
                            Button(action: { showSettings = true }) {
                                Image(systemName: "gearshape.fill")
                                    .font(.system(size: 18, weight: .medium))
                                    .foregroundColor(.secondary)
                                    .frame(width: 36, height: 36)
                                    .background(Color(.secondarySystemBackground))
                                    .clipShape(Circle())
                            }
                            .accessibilityLabel("Open Settings")
                        }
                    }
                    .padding(.top, 8)

                    // MARK: — Language Selector
                    HStack(spacing: 10) {
                        languagePicker(selection: $sourceLanguage, label: "From")

                        Button(action: swapLanguages) {
                            Image(systemName: "arrow.left.arrow.right")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 34, height: 34)
                                .background(Color.accentColor)
                                .clipShape(Circle())
                                .rotationEffect(.degrees(swapRotation))
                        }

                        languagePicker(selection: $targetLanguage, label: "To")
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color(.systemBackground))
                    .cornerRadius(14)
                    .shadow(color: .black.opacity(0.04), radius: 4, y: 2)

                    // MARK: — Source Input Card
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Label("Source", systemImage: "pencil")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.secondary)
                                .textCase(.uppercase)

                            Spacer()

                            if !sourceText.isEmpty {
                                Button(action: { sourceText = "" }) {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(.secondary)
                                        .font(.system(size: 16))
                                }
                                .transition(.opacity)
                            }
                        }

                        ZStack(alignment: .topLeading) {
                            if sourceText.isEmpty {
                                Text("Type or tap the mic to speak…")
                                    .foregroundColor(Color(.placeholderText))
                                    .font(.system(size: settings.fontSize.size))
                                    .padding(.top, 2)
                            }
                            TextEditor(text: $sourceText)
                                .frame(minHeight: 90, maxHeight: 160)
                                .font(.system(size: settings.fontSize.size))
                                .scrollContentBackground(.hidden)
                                .background(.clear)
                                .onChange(of: sourceText) { newValue in
                                    if newValue.count > maxCharacters {
                                        sourceText = String(newValue.prefix(maxCharacters))
                                    }
                                    if settings.autoTranslate && !newValue.isEmpty {
                                        translateText()
                                    }
                                }
                        }

                        if settings.showCharacterCount {
                            HStack {
                                Spacer()
                                Text("\(sourceText.count) / \(maxCharacters)")
                                    .font(.caption2)
                                    .foregroundColor(sourceText.count > Int(Double(maxCharacters) * 0.9)
                                        ? .orange : .secondary)
                            }
                        }
                    }
                    .padding(14)
                    .background(Color(.systemBackground))
                    .cornerRadius(16)
                    .shadow(color: .black.opacity(0.04), radius: 4, y: 2)

                    // MARK: — Translate & Mic buttons
                    HStack(spacing: 12) {
                        Button(action: {
                            if settings.hapticFeedback {
                                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            }
                            translateText()
                        }) {
                            Text("Translate")
                                .font(.body)
                                .fontWeight(.medium)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.accentColor)
                                .foregroundColor(.white)
                                .cornerRadius(13)
                        }

                        Button(action: {
                            isRecordingSource.toggle()
                            if settings.hapticFeedback {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            }
                        }) {
                            ZStack {
                                Circle()
                                    .fill(isRecordingSource ? Color.red : Color.accentColor)
                                    .frame(width: 60, height: 60)
                                    .shadow(color: (isRecordingSource ? Color.red : Color.accentColor).opacity(0.35),
                                            radius: 8, y: 3)

                                Image(systemName: isRecordingSource ? "stop.fill" : "mic.fill")
                                    .font(.system(size: 22, weight: .medium))
                                    .foregroundColor(.white)
                            }
                        }
                        .accessibilityLabel(isRecordingSource ? "Stop recording" : "Start voice input")
                        .scaleEffect(isRecordingSource ? 1.05 : 1.0)
                        .animation(.spring(response: 0.3), value: isRecordingSource)
                    }

                    if isRecordingSource {
                        HStack(spacing: 4) {
                            ForEach(0..<5) { i in
                                Capsule()
                                    .fill(Color.red.opacity(0.7))
                                    .frame(width: 3, height: CGFloat([10, 16, 22, 14, 10][i]))
                                    .animation(.easeInOut(duration: 0.5).repeatForever().delay(Double(i) * 0.1),
                                               value: isRecordingSource)
                            }
                            Text("Listening…")
                                .font(.caption)
                                .foregroundColor(.red)
                        }
                        .transition(.opacity)
                    }

                    // MARK: — Translation Output Card
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Label("Translation", systemImage: "text.bubble")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.secondary)
                                .textCase(.uppercase)

                            Spacer()

                            HStack(spacing: 8) {
                                Button(action: copyText) {
                                    Image(systemName: "doc.on.doc")
                                        .font(.system(size: 15))
                                        .foregroundColor(.secondary)
                                }
                                .accessibilityLabel("Copy translation")

                                Button(action: shareText) {
                                    Image(systemName: "square.and.arrow.up")
                                        .font(.system(size: 15))
                                        .foregroundColor(.secondary)
                                }
                                .accessibilityLabel("Share translation")
                            }
                        }

                        if translatedText.isEmpty {
                            Text("Translation will appear here")
                                .foregroundColor(Color(.placeholderText))
                                .font(.system(size: settings.fontSize.size))
                                .frame(minHeight: 90, alignment: .topLeading)
                        } else {
                            Text(translatedText)
                                .font(.system(size: settings.fontSize.size))
                                .frame(maxWidth: .infinity, minHeight: 90, alignment: .topLeading)
                                .textSelection(.enabled)
                        }

                        if settings.transliterationEnabled && !translatedText.isEmpty {
                            Text("Transliteration placeholder")
                                .font(.system(size: settings.fontSize.size - 2))
                                .foregroundColor(.secondary)
                                .italic()
                        }

                        Divider()

                        HStack(spacing: 10) {
                            Button(action: {
                                isSpeaking.toggle()
                                if settings.hapticFeedback {
                                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                }
                            }) {
                                Label(isSpeaking ? "Speaking…" : "Speak",
                                      systemImage: isSpeaking ? "speaker.wave.3.fill" : "speaker.wave.2")
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 9)
                                    .background(Color.accentColor.opacity(0.1))
                                    .foregroundColor(.accentColor)
                                    .cornerRadius(10)
                            }
                            .disabled(translatedText.isEmpty)

                            Button(action: {
                                isSaved.toggle()
                                if settings.hapticFeedback {
                                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                }
                            }) {
                                Label(isSaved ? "Saved" : "Save",
                                      systemImage: isSaved ? "bookmark.fill" : "bookmark")
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 9)
                                    .background(Color(.secondarySystemBackground))
                                    .foregroundColor(isSaved ? .orange : .primary)
                                    .cornerRadius(10)
                            }
                            .disabled(translatedText.isEmpty)
                        }
                    }
                    .padding(14)
                    .background(Color(.systemBackground))
                    .cornerRadius(16)
                    .shadow(color: .black.opacity(0.04), radius: 4, y: 2)

                    Spacer(minLength: 20)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
                .animation(.easeInOut(duration: 0.2), value: isRecordingSource)
                .animation(.easeInOut(duration: 0.2), value: translatedText)
            }
        }
        .preferredColorScheme(settings.colorScheme.colorScheme)
        .sheet(isPresented: $showSettings) {
            SettingsView(settings: $settings, languages: languages)
        }
        .onAppear {
            sourceLanguage = settings.defaultSourceLanguage
            targetLanguage = settings.defaultTargetLanguage
        }
    }

    // MARK: — Subview: Language Picker
    @ViewBuilder
    func languagePicker(selection: Binding<String>, label: String) -> some View {
        Menu {
            ForEach(languages, id: \.self) { lang in
                Button {
                    selection.wrappedValue = lang
                } label: {
                    Text(lang)
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(selection.wrappedValue)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Image(systemName: "chevron.down")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(9)
        }
        .foregroundColor(.primary)
    }

    // MARK: — Actions
    func swapLanguages() {
        let temp = sourceLanguage
        sourceLanguage = targetLanguage
        targetLanguage = temp
        withAnimation(.spring(response: 0.4)) {
            swapRotation += 180
        }
    }

    func translateText() {
        guard !sourceText.isEmpty else { return }
        translatedText = "[Translated] " + sourceText
        isSaved = false
        isSpeaking = false
    }

    func copyText() {
        guard !translatedText.isEmpty else { return }
        UIPasteboard.general.string = translatedText
    }

    func shareText() {
        guard !translatedText.isEmpty else { return }
        // Wire up UIActivityViewController here
    }
}

#Preview {
    ContentView()
}
