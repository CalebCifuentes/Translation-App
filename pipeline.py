# imports:
# !pip install openai-whisper transformers peft torch

import sys
import json
import torch
import wave
import whisper
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, VitsModel, VitsTokenizer
from peft import PeftModel


# Mapping codes to translate between various libaries
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


# Using a model cache so we don't have to reload the TTS model for every request
_model_cache = {}



"""
Function: get_mms_model(lang_code)
Description: Loads and caches the MMS TTS model for the specified language code. If the model
is already cached, it returns the cached version. Otherwise, it loads the model and tokenizer from Hugging Face and stores them in the cache before returning.

Parameters:
- lang_code (str): The language code for which to load the TTS model (e.g., "en" for English, "es" for Spanish).
Returns:
- tuple: A tuple containing the tokenizer and model for the specified language.
"""

def get_mms_model(lang_code):
    if lang_code not in _model_cache:
        name = LANG_MODELS[lang_code]
        _model_cache[lang_code] = (
            VitsTokenizer.from_pretrained(name),
            VitsModel.from_pretrained(name)
        )
    return _model_cache[lang_code]



"""
Function: synthesize(text, lang, output_path="output.wav")
Description: Synthesizes speech from the given text using the MMS TTS model for the specified
language. It converts the generated waveform to PCM format and saves it as a WAV file at the specified output path.

Parameters:
- text (str): The input text to be synthesized into speech.
- lang (str): The language code for the TTS model to use (e.g., "en" for English, "es" for Spanish, etc.).
- output_path (str, optional): The file path where the synthesized audio will be saved. Defaults to "output.wav". --> likely will be overriden by node.js server in the request.
Returns:
- None: The function saves the synthesized audio to a file and does not return any value.
"""
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
whisper_model = whisper.load_model("large-v2")

print("Loading translation model...", file=sys.stderr)

# Renamed from tokenizer to nllb_tokenizer to avoid collision with
# VitsTokenizer also named tokenizer in get_mms_model()
nllb_tokenizer = AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M")
# For the translation model, we load the base NLLB model and then apply the LoRA adapter 
# on top of it.
base_model = AutoModelForSeq2SeqLM.from_pretrained("facebook/nllb-200-distilled-600M")
# My LoRA adapter based on the NLLB model, trained a multilingual dataset
lora_model = PeftModel.from_pretrained(base_model, "rob-wav/nllb-multi-lora-adapter-v2")
lora_model.eval()



"""
Function: translate(text, source_lang, target_lang)
Description: Translates the input text from the source language to the target language using the NLLB
model with a LoRA adapter. The function splits the input text into sentences to avoid truncation issues, 
translates each sentence individually, and then combines the translated sentences into a single string.

Parameters:
- text (str): The input text to be translated.
- source_lang (str): The language code of the source text (e.g., "eng_Latn" for English).
- target_lang (str): The language code of the target text (e.g., "spa_Latn" for Spanish).
Returns:
- str: The translated text in the target language.
"""
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
        translated_chunks.append(nllb_tokenizer.batch_decode(outputs, skip_special_tokens=True)[0])

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
        output_file = request.get("output_file", "output.wav")

        # Transcribe - added language hint to improve accuracy
        result = whisper_model.transcribe(audio_file, fp16=False, language=NLLB_TO_WHISPER.get(source_lang))
        full_text = str(result["text"]).strip()
        detected_lang = result["language"]

        # Translate - using the new translate() function defined above
        translated_text = translate(full_text, source_lang, target_lang)

        # Synthesize - using the new synthesize() function defined above
        mms_lang = NLLB_TO_MMS.get(target_lang, "en")
        synthesize(translated_text, mms_lang, output_file)

        response = {
            "status": "ok",
            "transcription": full_text,
            "translation": translated_text,
            "output_file": output_file,
            "detected_lang": detected_lang,
        }

    except Exception as e:
        response = {
            "status": "error",
            "error": str(e)
        }

    print(json.dumps(response), flush=True)