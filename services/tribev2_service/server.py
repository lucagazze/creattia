import base64
import hashlib
import io
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import imageio.v3 as iio
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from PIL import Image


class AnalyzeRequest(BaseModel):
    frames: List[str] = []
    imageUrl: Optional[str] = None
    isVideo: bool = False


app = FastAPI(title="CAR TRIBE v2 Creative Analyzer")
MODEL = None
CACHE_DIR = Path(os.environ.get("TRIBE_V2_CACHE_DIR", "./cache")).resolve()
API_KEY = os.environ.get("TRIBE_V2_API_KEY", "").strip()


def _check_auth(auth_header: Optional[str]) -> None:
    if not API_KEY:
        return
    if auth_header != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Invalid TRIBE v2 API key")


def _load_model():
    global MODEL
    if MODEL is None:
        from tribev2 import TribeModel

        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        MODEL = TribeModel.from_pretrained(
            "facebook/tribev2",
            cache_folder=str(CACHE_DIR),
            device=os.environ.get("TRIBE_V2_DEVICE", "cpu"),
            config_update={
                "data.audio_feature.device": "cpu",
                "data.image_feature.device": "cpu",
                "data.text_feature.device": "cpu",
                "data.video_feature.image.device": "cpu",
            },
        )
    return MODEL


def _decode_frame(frame: str) -> Image.Image:
    payload = frame.split(",", 1)[1] if "," in frame else frame
    raw = base64.b64decode(payload)
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    image.thumbnail((512, 512))
    return image


def _frames_to_video(frames: List[str], tmp_dir: Path) -> Path:
    if not frames:
        raise HTTPException(status_code=400, detail="No frames provided")

    images = [_decode_frame(frame) for frame in frames[:24]]
    width = max(64, max(image.width for image in images))
    height = max(64, max(image.height for image in images))

    arrays = []
    for image in images:
        canvas = Image.new("RGB", (width, height), (0, 0, 0))
        canvas.paste(image, ((width - image.width) // 2, (height - image.height) // 2))
        arrays.append(np.asarray(canvas))

    if len(arrays) == 1:
        arrays = arrays * 3

    digest = hashlib.sha1(b"".join(arr.tobytes()[:2048] for arr in arrays)).hexdigest()[:12]
    video_path = tmp_dir / f"creative-{digest}.mp4"
    iio.imwrite(video_path, arrays, fps=1, codec="libx264", pixelformat="yuv420p")
    return video_path


def _score_from_predictions(preds: Any) -> Dict[str, Any]:
    arr = np.asarray(preds, dtype=np.float32)
    if arr.size == 0:
        raise HTTPException(status_code=500, detail="TRIBE v2 returned empty predictions")

    arr = np.nan_to_num(arr)
    abs_arr = np.abs(arr)
    temporal = abs_arr.mean(axis=1) if arr.ndim >= 2 else abs_arr
    spatial = abs_arr.mean(axis=0) if arr.ndim >= 2 else abs_arr

    attention_raw = float(np.percentile(temporal, 90))
    emotion_raw = float(np.std(temporal) + np.percentile(abs_arr, 75))
    load_raw = float(np.std(spatial) / (np.mean(spatial) + 1e-6))

    def squash(value: float, scale: float) -> int:
        return int(max(0, min(99, round(99 * (1 - np.exp(-value / max(scale, 1e-6)))))))

    attention = squash(attention_raw, float(np.mean(temporal) + np.std(temporal) + 1e-6))
    emotion = squash(emotion_raw, float(np.mean(abs_arr) + np.std(abs_arr) + 1e-6))
    cog_load = int(max(8, min(92, round(35 + 35 * np.tanh(load_raw - 0.8)))))

    region_labels = ["V1", "FFA", "EBA", "A1", "Amigdala"]
    region_index = int(np.argmax([
        float(np.percentile(spatial, 95)),
        float(np.percentile(spatial, 85)),
        float(np.std(spatial)),
        float(np.mean(temporal)),
        float(np.max(temporal)),
    ]))

    return {
        "attentionPct": attention,
        "attentionReason": "TRIBE v2 predijo una respuesta cortical alta en los momentos de mayor activacion del creativo.",
        "emotionPct": emotion,
        "emotionReason": "La variacion temporal de la respuesta fMRI estimada indica el nivel de impacto emocional del estimulo.",
        "cogLoad": cog_load,
        "cogLoadReason": "La dispersion espacial de la respuesta predicha se usa como proxy de esfuerzo cognitivo.",
        "highestRegion": region_labels[region_index],
        "textInsight": "Analisis generado con TRIBE v2 sobre la respuesta cerebral predicha para el estimulo visual.",
        "actionItems": [
            "Reforzar el gancho visual en los primeros segundos.",
            "Reducir elementos que compitan con el mensaje principal.",
            "Aumentar contraste entre producto, copy y CTA.",
            "Probar una version con cierre visual mas claro.",
        ],
        "provider": "tribev2",
    }


@app.get("/health")
def health() -> Dict[str, str]:
    return {"ok": "true", "provider": "tribev2"}


@app.post("/analyze")
def analyze(payload: AnalyzeRequest, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    _check_auth(authorization)
    with tempfile.TemporaryDirectory(prefix="car-tribev2-") as tmp:
        tmp_dir = Path(tmp)
        video_path = _frames_to_video(payload.frames, tmp_dir)
        model = _load_model()
        events = model.get_events_dataframe(video_path=str(video_path))
        preds, segments = model.predict(events=events)
        result = _score_from_predictions(preds)
        result["segments"] = int(len(segments)) if hasattr(segments, "__len__") else 0
        return result
