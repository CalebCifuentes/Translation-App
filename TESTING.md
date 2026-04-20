# TESTING README



### How to run:
- install all dependencies

> pip install faster_whisper transformers peft gtts

- then run file

```bash
python pipeline.py
```

- pass JSON through backend or locally:
example:
```bash
{"audio_file":"test.mp3","source_lang":"eng_Latn","target_lang":"spa_Latn","output_file":"out.mp3"}
```
