"""Thin wrappers around the three models the harness uses.

- YuNet (OpenCV zoo, MIT): face boxes + 5 landmarks.
- SFace (OpenCV zoo, Apache-2.0): 128-d face embedding, cosine similarity.
- MediaPipe Pose Landmarker (Apache-2.0): 33 body keypoints, run per person
  on a crop anchored on that person's face. Full-image multi-pose was tried
  first and collapses overlapping people into one (the real 2026-09-25
  Screen Test output: two people side by side -> 1 pose), so faces are the
  person anchor and pose runs once per face.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

import cv2  # noqa: E402
import mediapipe as mp  # noqa: E402
import numpy as np  # noqa: E402
from mediapipe.tasks.python import BaseOptions, vision  # noqa: E402

# Anatomical names (the person's own left/right), MediaPipe indices.
KEYPOINTS = {
    "nose": 0,
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24,
    "left_knee": 25,
    "right_knee": 26,
    "left_ankle": 27,
    "right_ankle": 28,
}


@dataclass
class Person:
    face_box: tuple[float, float, float, float] | None  # x, y, w, h in px
    face_row: np.ndarray | None  # raw YuNet row (needed by SFace alignCrop)
    face_score: float
    head: tuple[float, float]  # normalized (x / W, y / H)
    face_h: float  # face box height, normalized by image height (0 if faceless)
    # name -> (x / W, y / H, visibility)
    keypoints: dict[str, tuple[float, float, float]] = field(default_factory=dict)
    embedding: np.ndarray | None = None


def load_image(path: str | Path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"cannot read image: {path}")
    return img


class Vision:
    def __init__(self, model_paths: dict[str, Path], face_min_score: float = 0.8):
        self.face_min_score = face_min_score
        self._detector = cv2.FaceDetectorYN.create(
            str(model_paths["face_detector"]), "", (320, 320), face_min_score, 0.3, 50
        )
        self._recognizer = cv2.FaceRecognizerSF.create(str(model_paths["face_embedder"]), "")
        opts = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_paths["pose"])),
            running_mode=vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=0.3,
            min_pose_presence_confidence=0.3,
        )
        self._pose = vision.PoseLandmarker.create_from_options(opts)
        multi = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_paths["pose"])),
            running_mode=vision.RunningMode.IMAGE,
            num_poses=6,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
        )
        self._pose_multi = vision.PoseLandmarker.create_from_options(multi)

    def close(self) -> None:
        self._pose.close()
        self._pose_multi.close()

    # ---- faces -------------------------------------------------------------

    def detect_faces(self, img: np.ndarray, min_long_side: int = 0) -> np.ndarray:
        """Returns YuNet rows (N x 15) in the coordinates of `img`. Small
        images are upscaled first so tiny faces (full-body sheet panels) are
        still found."""
        h, w = img.shape[:2]
        scale = 1.0
        if min_long_side and max(h, w) < min_long_side:
            scale = min_long_side / max(h, w)
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        ih, iw = img.shape[:2]
        self._detector.setInputSize((iw, ih))
        _, faces = self._detector.detect(img)
        if faces is None:
            return np.zeros((0, 15), np.float32)
        faces = faces[faces[:, 14] >= self.face_min_score].copy()
        faces[:, :14] /= scale
        return faces

    def embed(self, img: np.ndarray, face_row: np.ndarray) -> np.ndarray:
        aligned = self._recognizer.alignCrop(img, face_row)
        return self._recognizer.feature(aligned).copy()

    def cosine(self, a: np.ndarray, b: np.ndarray) -> float:
        return float(self._recognizer.match(a, b, cv2.FaceRecognizerSF_FR_COSINE))

    def reference_embedding(self, path: str | Path) -> np.ndarray:
        """Embedding of the largest face in a reference photo."""
        img = load_image(path)
        faces = self.detect_faces(img, min_long_side=640)
        if len(faces) == 0:
            raise RuntimeError(f"no face found in reference photo {path}")
        best = faces[np.argmax(faces[:, 2] * faces[:, 3])]
        return self.embed(img, best)

    # ---- pose --------------------------------------------------------------

    def _pose_on(self, img: np.ndarray, x0: int, y0: int, x1: int, y1: int, multi: bool = False):
        crop = np.ascontiguousarray(img[y0:y1, x0:x1, ::-1])
        res = (self._pose_multi if multi else self._pose).detect(
            mp.Image(image_format=mp.ImageFormat.SRGB, data=crop)
        )
        h, w = img.shape[:2]
        out = []
        for lms in res.pose_landmarks:
            out.append(
                {
                    name: (
                        (x0 + lms[i].x * (x1 - x0)) / w,
                        (y0 + lms[i].y * (y1 - y0)) / h,
                        float(lms[i].visibility),
                    )
                    for name, i in KEYPOINTS.items()
                }
            )
        return out

    def detect_people(self, img: np.ndarray, match_max_dist: float = 1.0, max_people: int = 6) -> list[Person]:
        """One Person per confident face, each with a pose from a crop
        anchored on that face; plus any extra full-image pose whose nose is
        not near a face (people turned away from camera)."""
        h, w = img.shape[:2]
        faces = self.detect_faces(img)
        faces = faces[np.argsort(-faces[:, 14])][:max_people]
        people: list[Person] = []
        for f in faces:
            fx, fy, fw, fh = (float(v) for v in f[:4])
            cx, cy = fx + fw / 2, fy + fh / 2
            x0, x1 = int(max(0, cx - 2.5 * fw)), int(min(w, cx + 2.5 * fw))
            y0, y1 = int(max(0, fy - 1.0 * fh)), h
            kps: dict = {}
            for cand in self._pose_on(img, x0, y0, x1, y1):
                nx, ny, _ = cand["nose"]
                if np.hypot(nx * w - cx, ny * h - cy) <= match_max_dist * fw:
                    kps = cand
                    break
            people.append(
                Person(
                    face_box=(fx, fy, fw, fh),
                    face_row=f,
                    face_score=float(f[14]),
                    head=(cx / w, cy / h),
                    face_h=fh / h,
                    keypoints=kps,
                    embedding=self.embed(img, f),
                )
            )
        # Faceless people (backs to camera): full-image poses with no face nearby.
        for cand in self._pose_on(img, 0, 0, w, h, multi=True):
            nx, ny, _ = cand["nose"]
            torso_vis = min(cand[k][2] for k in ("left_shoulder", "right_shoulder", "left_hip", "right_hip"))
            if torso_vis < 0.5:
                continue
            near = any(
                p.face_box and np.hypot(nx * w - (p.face_box[0] + p.face_box[2] / 2), ny * h - (p.face_box[1] + p.face_box[3] / 2))
                <= 1.5 * p.face_box[2]
                for p in people
            )
            # Also skip if its shoulders coincide with an existing person's.
            dup = any(
                p.keypoints
                and abs(p.keypoints["left_shoulder"][0] - cand["left_shoulder"][0]) < 0.03
                and abs(p.keypoints["right_shoulder"][0] - cand["right_shoulder"][0]) < 0.03
                for p in people
            )
            if not near and not dup and len(people) < max_people:
                people.append(Person(None, None, 0.0, (nx, ny), 0.0, cand, None))
        return people
