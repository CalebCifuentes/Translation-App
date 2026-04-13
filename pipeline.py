# pipeline for handling transcription, translation, and TTS in a single flow
import sys
import json
from faster_whisper import WhisperModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, pipeline as hf_pipeline
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
# This is crucial for performance, as loading models can be time-consuming.
# After models are loaded, the server should send requests to the pipeline for processing.
print("Loading transcription model...", file=sys.stderr)
whisper_model = WhisperModel("distil-large-v3", device="cpu", compute_type="int8")

print("Loading translation model...", file=sys.stderr)
tokenizer = AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M")
base_model = AutoModelForSeq2SeqLM.from_pretrained("facebook/nllb-200-distilled-600M")
lora_model = PeftModel.from_pretrained(base_model, "rob-wav/nllb-multi-lora-adapter-v2")
lora_model.eval()

translator = hf_pipeline(
    "translation",
    model=lora_model,
    tokenizer=tokenizer,
    max_length=512,
)

print("Pipeline ready", file=sys.stderr)
sys.stderr.flush()


# The JSON request format should be:
#
# {
#     "audio_file": "audio.mp3",
#     "source_lang": "<source_lang_code>",  # e.g., "eng_Latn"
#     "target_lang": "<target_lang_code>",  # e.g., "spa_Latn"
#     "output_file": "output.mp3"
# }
#
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
        result = translator(full_text, src_lang=source_lang, tgt_lang=target_lang)
        translated_text = result[0]["translation_text"]

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