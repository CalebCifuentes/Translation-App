# imports:
# !pip install faster-whisper transformers peft gtts

# pipeline for handling transcription, translation, and TTS in a single flow
import sys
import json
from faster_whisper import WhisperModel
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

# --- Loading Models Once ---
print("Loading transcription model...", file=sys.stderr)
whisper_model = WhisperModel("distil-large-v3", device="cpu", compute_type="int8")

print("Loading translation model...", file=sys.stderr)
tokenizer = AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M")
base_model = AutoModelForSeq2SeqLM.from_pretrained("facebook/nllb-200-distilled-600M")
lora_model = PeftModel.from_pretrained(base_model, "rob-wav/nllb-multi-lora-adapter-v2")
lora_model.eval()

def translate(text, source_lang, target_lang):
    inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
    target_lang_id = tokenizer.convert_tokens_to_ids(target_lang)
    outputs = lora_model.generate(
        **inputs,
        forced_bos_token_id=target_lang_id,
        max_length=512
    )
    return tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]

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
        segments, info = whisper_model.transcribe(
            audio_file,
            beam_size=5,
            condition_on_previous_text=False
        )
        full_text = " ".join([segment.text.strip() for segment in segments])

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
            "detected_lang": info.language,
            "confidence": round(info.language_probability, 2)
        }

    except Exception as e:
        response = {
            "status": "error",
            "error": str(e)
        }

    print(json.dumps(response), flush=True)
