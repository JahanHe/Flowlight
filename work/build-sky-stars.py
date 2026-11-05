# Offline feature extraction, no runtime pixel readback or new dependency.
from PIL import Image
from pathlib import Path
import json,random
im=Image.open('work/sky-source/galaxy-bounded.webp').convert('RGB');w,h=im.size
lum=lambda x,y:sum(im.getpixel((x,y)))/3
points=[]
for y in range(2,h-2,2):
 for x in range(2,w-2,2):
  p=lum(x,y)
  if p<65:continue
  near=[lum(x-2,y),lum(x+2,y),lum(x,y-2),lum(x,y+2)]
  if p>max(near)+6 and p>sum(near)/4+15:points.append((x,y,p))
rng=random.Random(832);rng.shuffle(points);points=points[:900]
stars=[[x,y,i%3,round(min(1,p/210),3),round(rng.random()*6.283,3)] for i,(x,y,p) in enumerate(points)]
p=Path('work/sky-assets.js');s=p.read_text().split('\nwindow.clockSkyStars=')[0];p.write_text(s.rstrip()+'\nwindow.clockSkyStars='+json.dumps(stars,separators=(',',':'))+';\n');print('stars',len(stars),'asset bytes',p.stat().st_size)
