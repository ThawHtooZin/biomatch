import os
import tempfile
from pathlib import Path

import cv2
import numpy as np
import psycopg
from deepface import DeepFace
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from pgvector.psycopg import register_vector

BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR.parent / "backend"
load_dotenv(BACKEND_DIR / ".env")
STORAGE_PATH = Path(os.getenv("BIOMATCH_STORAGE_PATH", BASE_DIR.parent / "backend/storage/app/public"))
MATCH_THRESHOLD = float(os.getenv("BIOMATCH_MATCH_THRESHOLD", "0.55"))
FACE_DETECTOR_BACKEND = "retinaface"
EMBEDDING_MODEL = "Facenet512"
EMBEDDING_DIMENSIONS = 512

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024


class BiometricError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _error_response(error: BiometricError):
    return jsonify({"code": error.code, "message": error.message}), error.status_code


def _database_connection():
    connection_url = (
        os.getenv("BIOMATCH_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or os.getenv("DB_URL")
        or ""
    ).strip()

    if not connection_url and os.getenv("DB_CONNECTION", "pgsql").lower() not in {"pgsql", "postgres", "postgresql"}:
        raise BiometricError(
            "database_configuration_error",
            "The biometric service must be configured to use PostgreSQL.",
            503,
        )

    connection = None
    try:
        if connection_url:
            connection = psycopg.connect(connection_url, connect_timeout=5)
        else:
            database_name = os.getenv("DB_DATABASE")
            if not database_name:
                raise BiometricError(
                    "database_configuration_error",
                    "PostgreSQL database settings are incomplete.",
                    503,
                )

            connection = psycopg.connect(
                host=os.getenv("DB_HOST", "127.0.0.1"),
                port=os.getenv("DB_PORT", "5432"),
                dbname=database_name,
                user=os.getenv("DB_USERNAME", "postgres"),
                password=os.getenv("DB_PASSWORD", ""),
                sslmode=os.getenv("DB_SSLMODE", "prefer"),
                connect_timeout=5,
            )

        register_vector(connection)
        return connection
    except BiometricError:
        if connection is not None:
            connection.close()
        raise
    except psycopg.Error as error:
        if connection is not None:
            connection.close()
        app.logger.exception("PostgreSQL connection failed")
        raise BiometricError(
            "database_unavailable",
            "The biometric database is unavailable. Try again shortly.",
            503,
        ) from error


def _embedding_from_image(image_path: str) -> np.ndarray:
    if cv2.imread(image_path) is None:
        raise BiometricError("invalid_image", "The image could not be read. Try another image.")

    try:
        representations = DeepFace.represent(
            img_path=image_path,
            model_name=EMBEDDING_MODEL,
            detector_backend=FACE_DETECTOR_BACKEND,
            enforce_detection=True,
        )
    except ValueError as error:
        app.logger.info("Face embedding rejected an image: %s", error)
        raise BiometricError(
            "no_face_detected",
            "No clear face was found. Use a well-lit image with one face looking toward the camera.",
        ) from error
    except Exception as error:
        app.logger.exception("Face embedding generation failed")
        raise BiometricError(
            "embedding_generation_failed",
            "The face could not be processed. Try again with a clearer image.",
            503,
        ) from error

    if not representations:
        raise BiometricError(
            "no_face_detected",
            "No clear face was found. Use a well-lit image with one face looking toward the camera.",
        )

    try:
        embedding = np.asarray(representations[0]["embedding"], dtype=np.float32)
    except (KeyError, TypeError, ValueError, IndexError) as error:
        app.logger.exception("DeepFace returned an invalid embedding")
        raise BiometricError(
            "embedding_generation_failed",
            "The face could not be processed. Try again with a clearer image.",
            503,
        ) from error

    if embedding.shape != (EMBEDDING_DIMENSIONS,) or not np.isfinite(embedding).all():
        app.logger.error("DeepFace returned an embedding with shape %s", embedding.shape)
        raise BiometricError(
            "embedding_dimension_mismatch",
            "The biometric model returned an incompatible vector. Contact support.",
            503,
        )

    return embedding


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.errorhandler(413)
def image_too_large(_error):
    return _error_response(BiometricError(
        "image_too_large",
        "The image is too large. Choose an image smaller than 5 MB.",
        413,
    ))


@app.post("/detect")
def detect():
    uploaded_image = request.files.get("image")
    if uploaded_image is None or uploaded_image.filename == "":
        return _error_response(BiometricError("missing_image", "Choose an image to scan."))

    temporary_path = None
    try:
        suffix = Path(uploaded_image.filename).suffix or ".jpg"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary_file:
            uploaded_image.save(temporary_file)
            temporary_path = temporary_file.name

        frame = cv2.imread(temporary_path)
        if frame is None:
            return _error_response(BiometricError("invalid_image", "The image could not be read. Try another image."))

        frame_height, frame_width = frame.shape[:2]
        faces = DeepFace.extract_faces(
            img_path=temporary_path,
            detector_backend=FACE_DETECTOR_BACKEND,
            enforce_detection=False,
            align=False,
        )
        candidates = [
            face
            for face in faces
            if float(face.get("confidence", 0)) > 0
            and face.get("facial_area", {}).get("w", 0) > 0
            and face.get("facial_area", {}).get("h", 0) > 0
        ]
        if not candidates:
            return jsonify({
                "detected": False,
                "code": "no_face_detected",
                "message": "No face was found. Center one face in the camera and improve the lighting.",
            }), 200

        largest_face = max(
            candidates,
            key=lambda face: face["facial_area"]["w"] * face["facial_area"]["h"],
        )
        area = largest_face["facial_area"]
        return jsonify({
            "detected": True,
            "face": {
                "x": area["x"] / frame_width,
                "y": area["y"] / frame_height,
                "width": area["w"] / frame_width,
                "height": area["h"] / frame_height,
            },
            "confidence": float(largest_face["confidence"]),
        }), 200
    except Exception:
        app.logger.exception("Live face detection failed")
        return _error_response(BiometricError(
            "detection_unavailable",
            "Live face detection is temporarily unavailable. Check the biometric service and try again.",
            503,
        ))
    finally:
        if temporary_path:
            Path(temporary_path).unlink(missing_ok=True)


@app.post("/match")
def match():
    uploaded_image = request.files.get("image")
    if uploaded_image is None or uploaded_image.filename == "":
        return _error_response(BiometricError("missing_image", "Choose an image to scan."))

    temporary_path = None
    try:
        suffix = Path(uploaded_image.filename).suffix or ".jpg"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary_file:
            uploaded_image.save(temporary_file)
            temporary_path = temporary_file.name

        live_embedding = _embedding_from_image(temporary_path)
        with _database_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT civ_id, face_embedding <=> %s AS distance
                    FROM civilians
                    WHERE face_embedding IS NOT NULL
                    ORDER BY face_embedding <=> %s
                    LIMIT 1
                    """,
                    (live_embedding, live_embedding),
                )
                closest_match = cursor.fetchone()

        if closest_match is None:
            return jsonify({
                "matched": False,
                "reason": "no_biometrics",
                "message": "No civilian biometric profiles have been generated yet.",
            }), 200

        citizen_id, raw_distance = closest_match
        distance = float(raw_distance)
        matched = distance <= MATCH_THRESHOLD

        return jsonify({
            "matched": matched,
            "citizen_id": str(citizen_id) if matched else None,
            "distance": distance,
            "threshold": MATCH_THRESHOLD,
            "reason": None if matched else "no_match",
            "message": None if matched else "No matching civilian was found.",
        }), 200
    except BiometricError as error:
        return _error_response(error)
    except psycopg.Error as error:
        app.logger.exception("Could not query civilian biometric vectors")
        return _error_response(BiometricError(
            "database_query_failed",
            "The biometric database could not complete the search. Try again shortly.",
            503,
        ))
    finally:
        if temporary_path:
            Path(temporary_path).unlink(missing_ok=True)


def generate_pending_embeddings():
    try:
        with _database_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT civ_id, full_name, photo_path FROM civilians WHERE face_embedding IS NULL ORDER BY created_at"
                )
                pending_civilians = cursor.fetchall()
    except BiometricError:
        raise
    except psycopg.Error as error:
        app.logger.exception("Could not load civilians without biometric vectors")
        raise BiometricError(
            "database_query_failed",
            "The pending biometric records could not be loaded. Try again shortly.",
            503,
        ) from error

    storage_root = STORAGE_PATH.resolve()
    generated = 0
    skipped = 0
    failures = []

    for citizen_id, full_name, photo_path in pending_civilians:
        failure = None
        if not photo_path:
            failure = BiometricError("photo_missing", "No photo is saved for this civilian.")
        else:
            image_path = (STORAGE_PATH / photo_path).resolve()
            if not image_path.is_relative_to(storage_root):
                failure = BiometricError("invalid_photo_path", "The saved photo path is invalid.")
            elif not image_path.is_file():
                failure = BiometricError("photo_not_found", "The saved photo could not be found.")

        if failure is not None:
            failures.append({
                "civ_id": str(citizen_id),
                "full_name": full_name,
                "code": failure.code,
                "message": failure.message,
            })
            continue

        try:
            embedding = _embedding_from_image(str(image_path))
            with _database_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE civilians SET face_embedding = %s WHERE civ_id = %s AND face_embedding IS NULL",
                        (embedding, citizen_id),
                    )
                    updated = cursor.rowcount

            if updated:
                generated += 1
            else:
                skipped += 1
        except BiometricError as error:
            failures.append({
                "civ_id": str(citizen_id),
                "full_name": full_name,
                "code": error.code,
                "message": error.message,
            })
        except psycopg.Error:
            app.logger.exception("Could not save biometric vector for civilian %s", citizen_id)
            failures.append({
                "civ_id": str(citizen_id),
                "full_name": full_name,
                "code": "database_write_failed",
                "message": "The biometric could not be saved. Try again later.",
            })

    return {
        "total": len(pending_civilians),
        "generated": generated,
        "skipped": skipped,
        "failed": len(failures),
        "failures": failures,
    }


@app.post("/generate-embeddings")
def generate_all():
    try:
        return jsonify(generate_pending_embeddings()), 200
    except BiometricError as error:
        return _error_response(error)


if __name__ == "__main__":
    app.run(
        host=os.getenv("BIOMATCH_HOST", "127.0.0.1"),
        port=int(os.getenv("BIOMATCH_PORT", "5001")),
        debug=os.getenv("BIOMATCH_DEBUG", "false").lower() == "true",
    )