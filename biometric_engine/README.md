# Biometric engine

The engine reads PostgreSQL settings from `backend/.env`. Set `DB_CONNECTION=pgsql`, configure `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`, then run the Laravel migration that enables pgvector and creates `civilians.face_embedding vector(512)`.

Install the Python dependencies once:

```sh
cd biometric_engine
venv/bin/pip install -r requirements.txt
```

Start the matching service while Laravel is running:

```sh
venv/bin/python app.py
```

The service listens on `http://127.0.0.1:5001` by default. Laravel forwards authenticated captures to `/detect` and `/match`; the service returns a matched civilian `civ_id` when cosine distance is at or below `BIOMATCH_MATCH_THRESHOLD` (default `0.55`).

The engine uses DeepFace `Facenet512` embeddings (512 dimensions) for both matching and generation. Matching uses PostgreSQL cosine distance against `civilians.face_embedding`. `POST /generate-embeddings` processes civilians with missing embeddings, records per-civilian failures, and continues through the remaining records. The same worker can be run manually with `venv/bin/python generate_embeddings.py`.