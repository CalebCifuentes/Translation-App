# imports:
# !pip install faster-whisper transformers peft gtts

# pipeline for handling transcription, translation, and TTS in a single flow
import sys
import json
import torch
import wave
import whisper
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, VitsModel, VitsTokenizer
from peft import PeftModel

# Mapping from NLLB language codes to gTTS language codes for TTS synthesis.
NLLB_TO_WHISPER = {
    "eng_Latn": "en",
    "spa_Latn": "es",
    "amh_Ethi": "am",
    "uzb_Latn": "uz",
}

NLLB_TO_MMS = {
    "eng_Latn": "en",
    "spa_Latn": "es",
    "amh_Ethi": "am",
    "uzb_Latn": "uz",
}

LANG_MODELS = {
    "en": "facebook/mms-tts-eng",
    "es": "facebook/mms-tts-spa",
    "am": "facebook/mms-tts-amh",
    "uz": "facebook/mms-tts-uzb-script_cyrillic",
}

LANG_TO_NLLB = {
    "english" : "eng_Latn",
    "spanish" : "spa_Latn",
    "amharic" : "amh_Ethi",
    "uzbek" : "uzb_Latn",
}

def to_nllb_code(lang):
    lang = lang.lower().strip()
    if lang in LANG_TO_NLLB.values():
        return lang
    return LANG_TO_NLLB.get(lang)


_model_cache = {}



def get_mms_model(lang_code):
    if lang_code not in _model_cache:
        name = LANG_MODELS[lang_code]
        _model_cache[lang_code] = (
            VitsTokenizer.from_pretrained(name),
            VitsModel.from_pretrained(name)
        )
    return _model_cache[lang_code]

def synthesize(text, lang, output_path="output.wav"):
    tokenizer, model = get_mms_model(lang)
    inputs = tokenizer(text, return_tensors="pt")
    with torch.no_grad():
        waveform = model(**inputs).waveform

    pcm = (waveform.squeeze() * 32767).clamp(-32768, 32767).short()

    with wave.open(output_path, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(model.config.sampling_rate)
        f.writeframes(pcm.numpy().tobytes())


# --- Loading Models Once ---
print("Loading transcription model...", file=sys.stderr)
#whisper_model = WhisperModel("medium", device="cpu", compute_type="int8")
whisper_model = whisper.load_model("large-v2")


#print("Loading translation model...", file=sys.stderr)
nllb_tokenizer = AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M")
base_model = AutoModelForSeq2SeqLM.from_pretrained("facebook/nllb-200-distilled-600M")
lora_model = PeftModel.from_pretrained(base_model, "rob-wav/nllb-multi-lora-adapter-v2")
lora_model.eval()

def translate(text, source_lang, target_lang):
    sentences = text.split('. ')
    translated_chunks = []

    for sentence in sentences:
        if not sentence.strip():
            continue

        inputs = nllb_tokenizer(
            sentence,
            return_tensors="pt", 
            padding=True, 
            truncation=True, 
            max_length=1024,
            src_lang = source_lang
            )
        

        target_lang_id = nllb_tokenizer.convert_tokens_to_ids(target_lang)

        outputs = lora_model.generate(
            **inputs,
            forced_bos_token_id=target_lang_id,
            max_length=1024,
            num_beams=4,
            early_stopping=True,
            no_repeat_ngram_size=3,
        )

        translated_chunks.append(
            nllb_tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
        )

    return ' '.join(translated_chunks)


print("Pipeline ready", file=sys.stderr)
sys.stderr.flush()

# --- Request Loop ---
for line in sys.stdin:
    try:
        request = json.loads(line.strip())
        audio_file = request.get("audio_file")
        text_input = request.get("text")
        source_lang = to_nllb_code(request["source_lang"])
        target_lang = to_nllb_code(request["target_lang"])
        output_file = request.get("output_file")

        if not source_lang or not target_lang:
            raise ValueError(f"Unsupported language pair: {request['source_lang']} -> {request['target_lang']}")

        # --- CASE 1: TEXT ONLY ---
        if text_input:
            full_text = text_input
            detected_lang = source_lang
            confidence = 1.0

        # --- CASE 2: AUDIO ---
        elif audio_file:
            result = whisper_model.transcribe(audio_file, fp16=False, language=NLLB_TO_WHISPER.get(source_lang))
            full_text = str(result["text"]).strip()
            detected_lang = result["language"]
            confidence = 1.0 if detected_lang == source_lang else round(result["language_probability"], 2)
            

        else:
            raise Exception("No valid input (audio or text) provided")

        # --- TRANSLATE ---
        translated_text = translate(full_text, source_lang, target_lang)

        # --- TTS (only if output_file exists) ---
        if output_file:
            mms_lang = NLLB_TO_MMS.get(target_lang, "en")
            synthesize(translated_text, mms_lang, output_file)

        response = {
            "status": "ok",
            "transcription": full_text,
            "translation": translated_text,
            "output_file": output_file,
            "detected_lang": detected_lang,
            "confidence": confidence
        }

    except Exception as e:
        response = {
            "status": "error",
            "error": str(e)
        }

    print(json.dumps(response), flush=True)
    