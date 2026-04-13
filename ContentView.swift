//
//  ContentView.swift
//  TranslatorApp
//
//  Created by Noah Kifle on 3/10/26.
//

import SwiftUI

struct ContentView: View {
    @State private var sourceText: String = ""
    @State private var translatedText: String = ""
    @State private var sourceLanguage: String = "English"
    @State private var targetLanguage: String = "Uzbek"
    
    @State private var isRecordingSource = false
    @State private var isRecordingTarget = false
    
    let languages = ["English", "Spanish", "Uzbek", "Amharic", "Chinese", "Japanese"]
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Translator")
                .font(.largeTitle)
                .fontWeight(.bold)
            
            // Language Selection
            HStack {
                Picker("From", selection: $sourceLanguage) {
                    ForEach(languages, id: \.self) { lang in
                        Text(lang)
                    }
                }
                .pickerStyle(MenuPickerStyle())
                
                Image(systemName: "arrow.left.arrow.right")
                    .onTapGesture { swapLanguages() }
                
                Picker("To", selection: $targetLanguage) {
                    ForEach(languages, id: \.self) { lang in
                        Text(lang)
                    }
                }
                .pickerStyle(MenuPickerStyle())
            }
            .padding()
            
            // Input Text + Mic
            VStack {
                HStack {
                    Text("From")
                    Spacer()
                    Button(action: {
                        isRecordingSource.toggle()
                    }) {
                        Image(systemName: isRecordingSource ? "mic.fill" : "mic")
                            .foregroundColor(isRecordingSource ? .red : .blue)
                    }
                }
                
                TextEditor(text: $sourceText)
                    .frame(height: 150)
                    .padding()
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.gray))
            }
            
            // Translate Button
            Button(action: { translateText() }) {
                Text("Translate")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            }
            
            // Output Text + Mic
            VStack {
                HStack {
                    Text("To")
                    Spacer()
                    Button(action: {
                        isRecordingTarget.toggle()
                    }) {
                        Image(systemName: isRecordingTarget ? "mic.fill" : "mic")
                            .foregroundColor(isRecordingTarget ? .green : .blue)
                    }
                }
                
                TextEditor(text: $translatedText)
                    .frame(height: 150)
                    .padding()
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.gray))
            }
            
            // Action Buttons
            HStack(spacing: 20) {
                Button(action: { copyText() }) {
                    Label("Copy", systemImage: "doc.on.doc")
                }
                
                Button(action: { clearText() }) {
                    Label("Clear", systemImage: "trash")
                }
            }
            
            Spacer()
        }
        .padding()
    }
    
    func swapLanguages() {
        let temp = sourceLanguage
        sourceLanguage = targetLanguage
        targetLanguage = temp
    }
    
    func translateText() {
        translatedText = "[Translated] " + sourceText
    }
    
    func copyText() {
        UIPasteboard.general.string = translatedText
    }
    
    func clearText() {
        sourceText = ""
        translatedText = ""
    }
}

#Preview {
    ContentView()
}
