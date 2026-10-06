"""Regenerates the SYNTHETIC fixture images from the real ones. Deterministic.

    evals/.venv/bin/python evals/fixtures/make_synthetic.py

- synthetic_output_mirrored.jpg: the real Screen Test output flipped
  left/right -> people swap sides vs. the stage (horizontal-order failure).
- synthetic_output_missing_person.jpg: the woman (Cast 2) painted out of the
  real output -> one person where the stage has two (merged/dropped figure).
"""

from pathlib import Path

import cv2
import numpy as np

IMG = Path(__file__).resolve().parent / "images"
Q = [cv2.IMWRITE_JPEG_QUALITY, 90]

src = cv2.imread(str(IMG / "screen_test_output_2026-09-25.jpg"))

cv2.imwrite(str(IMG / "synthetic_output_mirrored.jpg"), cv2.flip(src, 1), Q)

# Woman's silhouette (px in the 1472x720 output), stopping at the man's
# left edge so he is untouched.
mask = np.zeros(src.shape[:2], np.uint8)
poly = np.array([[590, 130], [668, 130], [660, 240], [652, 680], [490, 680], [500, 560], [535, 420], [545, 250]], np.int32)
cv2.fillPoly(mask, [poly], 255)
mask = cv2.dilate(mask, np.ones((15, 15), np.uint8))
# Fill from a background strip to the left (x 330-480), then smooth seams.
fill = src.copy()
bg = src[:, 330:480]
for x0 in range(480, 780, 150):
    w = min(150, src.shape[1] - x0)
    fill[:, x0 : x0 + w] = bg[:, :w]
out = np.where(mask[..., None] > 0, fill, src)
out = cv2.inpaint(out, cv2.Canny(mask, 50, 150), 5, cv2.INPAINT_TELEA)
man = np.zeros_like(mask)
cv2.fillPoly(man, [np.array([[662, 90], [830, 90], [830, 700], [662, 700]], np.int32)], 255)
out = np.where(man[..., None] > 0, src, out)
cv2.imwrite(str(IMG / "synthetic_output_missing_person.jpg"), out, Q)
print("wrote synthetic fixtures to", IMG)
