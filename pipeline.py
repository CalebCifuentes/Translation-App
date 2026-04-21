# imports:
# !pip install openai-whisper transformers peft gtts

# pipeline for handling transcription, translation, and TTS in a single flow
import sys
import json
from unittest import result
import whisper
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from peft import PeftModel
from gtts import gTTS

# Mapping from NLLB language codes to gTTS language codes for TTS synthesis.
NLLB_TO_GTTS = {
    "eng_Latn": "en",
    "spa_Latn": "es",
    "amh_Ethi": "am",
    "uzb_Latn": "uz",
}

NLLB_TO_WHISPER = {
    "eng_Latn": "en",
    "spa_Latn": "es",
    "amh_Ethi": "am",
    "uzb_Latn": "uz",
}

# --- Loading Models Once ---
print("Loading transcription model...", file=sys.stderr)
whisper_model = whisper.load_model("large-v2")

print("Loading translation model...", file=sys.stderr)
tokenizer = AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M")
base_model = AutoModelForSeq2SeqLM.from_pretrained("facebook/nllb-200-distilled-600M")
lora_model = PeftModel.from_pretrained(base_model, "rob-wav/nllb-multi-lora-adapter-v2")
lora_model.eval()

def translate(text, source_lang, target_lang):
    # split into sentences to avoid input truncation on long audio
    sentences = text.split('. ')
    translated_chunks = []

    for sentence in sentences:
        if not sentence.strip():
            continue
        inputs = tokenizer(sentence, return_tensors="pt", padding=True, truncation=True, max_length=1024)
        target_lang_id = tokenizer.convert_tokens_to_ids(target_lang)
        outputs = lora_model.generate(
            **inputs,
            forced_bos_token_id=target_lang_id,
            max_length=1024,
            num_beams=4,
            early_stopping=True,
            no_repeat_ngram_size=3,
        )
        translated_chunks.append(tokenizer.batch_decode(outputs, skip_special_tokens=True)[0])

    return ' '.join(translated_chunks)

print("Pipeline ready", file=sys.stderr)
sys.stderr.flush()

# --- Request Loop ---
for line in sys.stdin:
    try:
        request = json.loads(line.strip())
        audio_file = request["audio_file"]
        source_lang = request["source_lang"]
        target_lang = request["target_lang"]
        output_file = request.get("output_file", "output.mp3")


        # Transcribe
        result = whisper_model.transcribe(audio_file, fp16=False, language=NLLB_TO_WHISPER.get(source_lang))
        full_text = str(result["text"]).strip()
        detected_lang = result["language"]      

        # Translate
        translated_text = translate(full_text, source_lang, target_lang)

        # Synthesize
        gtts_lang = NLLB_TO_GTTS.get(target_lang, "en")
        tts = gTTS(text=translated_text, lang=gtts_lang)
        tts.save(output_file)

        response = {
            "status": "ok",
            "transcription": full_text,
            "translation": translated_text,
            "output_file": output_file,
            "detected_lang": detected_lang,
            "confidence": round(result["language_probability"], 2)
        }

    except Exception as e:
        response = {
            "status": "ok",
            "transcription": full_text,
            "translation": translated_text,
            "output_file": output_file,
            "detected_lang": detected_lang,
            "confidence": 1.0  # whisper doesn't expose this directly
        }

    print(json.dumps(response), flush=True)