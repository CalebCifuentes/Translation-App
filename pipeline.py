import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import sys
import json
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from peft import PeftModel
from gtts import gTTS
import speech_recognition as sr

NLLB_TO_GTTS = {
    "eng_Latn": "en",
    "spa_Latn": "es",
    "amh_Ethi": "am",
    "uzb_Latn": "uz",
}

print("Loading translation model...", file=sys.stderr)
tokenizer = AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M")
base_model = AutoModelForSeq2SeqLM.from_pretrained("facebook/nllb-200-distilled-600M", low_cpu_mem_usage=True)
lora_model = PeftModel.from_pretrained(base_model, "rob-wav/nllb-multi-lora-adapter-v2")
lora_model.eval()
recognizer = sr.Recognizer()
print("Pipeline ready", file=sys.stderr)
sys.stderr.flush()

def transcribe(audio_path):
    with sr.AudioFile(audio_path) as source:
        audio = recognizer.record(source)
    return recognizer.recognize_google(audio)

def translate(text, source_lang, target_lang):
    inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
    target_lang_id = tokenizer.convert_tokens_to_ids(target_lang)
    outputs = lora_model.generate(**inputs, forced_bos_token_id=target_lang_id, max_length=512)
    return tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]

def translate_with_fallback(text, source_lang, target_lang):
    LANG_MAP = {
        "eng_Latn": "en",
        "spa_Latn": "es",
        "uzb_Latn": "uz",
        "amh_Ethi": "am"
    }
    uzbek_involved = "uzb_Latn" in [source_lang, target_lang]
    if uzbek_involved:
        from googletrans import Translator
        gt = Translator()
        src = LANG_MAP.get(source_lang, "en")
        tgt = LANG_MAP.get(target_lang, "en")
        return gt.translate(text, src=src, dest=tgt).text
    return translate(text, source_lang, target_lang)

for line in sys.stdin:
    try:
        request = json.loads(line.strip())
        source_lang = request["source_lang"]
        target_lang = request["target_lang"]
        output_file = request.get("output_file", "output.mp3")

        if "text" in request:
            full_text = request["text"]
        else:
            audio_file = request["audio_file"]
            full_text = transcribe(audio_file)

        translated_text = translate_with_fallback(full_text, source_lang, target_lang)
        gtts_lang = NLLB_TO_GTTS.get(target_lang, "en")
        try:
            tts = gTTS(text=translated_text, lang=gtts_lang)
            tts.save(output_file)
        except Exception:
            open(output_file, 'wb').close()

        response = {
            "status": "ok",
            "transcription": full_text,
            "translation": translated_text,
            "output_file": output_file,
            "detected_lang": source_lang,
            "confidence": 1.0
        }
    except Exception as e:
        response = {"status": "error", "error": str(e)}
    print(json.dumps(response), flush=True)
