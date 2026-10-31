"""
Prepares the Google Earth screenshot to be used as GROUND colour: removes labels, pins, coordinate text, legend and watermark
(inpainting) and evens out the colour jump between the blue-tinted top part and the brown bottom part (seam at y ~ 975).
sources/<id>/main_map.jpg -> sources/<id>/main_map_clean.jpg
"""
import sys
import cv2, numpy as np
rid = sys.argv[1] if len(sys.argv) > 1 else 'bogura'
im = cv2.imread(f'sources/{rid}/main_map.jpg'); H, W = im.shape[:2]
b, g, r = [im[..., k].astype(int) for k in range(3)]
white = (np.minimum(np.minimum(r, g), b) > 205)
blue = (b > 200) & (g > 110) & (r < 90)          # shopping pin
red = (r > 190) & (g < 90) & (b < 90)            # hospital pin
mask = (white | blue | red).astype(np.uint8)
mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))   # join letters of a word
mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
for x0, y0, x1, y1 in [(0, 0, 90, 34), (2460, 0, W, 48), (0, 1370, 75, H), (2430, 1330, W, H), (150, 20, 860, 80), (1700, 1280, 2400, 1340)]:
    mask[y0:y1, x0:x1] = 1                          # UI boxes, watermark, scale bar, the two coordinate captions
print('inpainting %.1f %% of pixels' % (100 * mask.mean()))
clean = cv2.inpaint(im, mask, 6, cv2.INPAINT_TELEA)
# even out the seam between the tinted top and brown bottom (per-channel mean/std of the bottom -> top)
SEAM = 975
top = clean[40:SEAM - 15].reshape(-1, 3).astype(np.float32); bot = clean[SEAM + 15:H - 40].reshape(-1, 3).astype(np.float32)
gain = np.clip(top.std(0) / bot.std(0), 0.6, 1.5); bias = top.mean(0) - gain * bot.mean(0)
print('bottom -> top gain', np.round(gain, 2), 'bias', np.round(bias, 1))
lower = np.clip(clean.astype(np.float32) * gain + bias, 0, 255)
w = np.clip((np.arange(H) - (SEAM - 12)) / 24.0, 0, 1)[:, None, None]        # 24 px blend across the seam
out = clean.astype(np.float32) * (1 - w) + lower * w
cv2.imwrite(f'sources/{rid}/main_map_clean.jpg', np.clip(out, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
