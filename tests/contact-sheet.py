# Stitches the run-cycle / throw frames captured by playwright-v7.cjs into contact sheets.
import json, os, sys
from PIL import Image
d = os.path.join(os.path.dirname(__file__), '..', 'screenshots')
fr = json.load(open(sys.argv[1]))
for k, name in (('run', 'v7-contact-run-cycle.png'), ('throw', 'v7-contact-throw.png')):
    ims = [Image.open(f) for f in fr[k]]
    w, h = ims[0].size
    sheet = Image.new('RGB', (w * 4, h * 2))
    for i, im in enumerate(ims): sheet.paste(im, ((i % 4) * w, (i // 4) * h))
    sheet.save(os.path.join(d, name))
    for f in fr[k]: os.remove(f)
