from pathlib import Path
from PIL import Image, ImageChops
import math, base64, json, sys
asset_file=Path('work/sky-assets.js');existing=asset_file.read_text() if asset_file.exists() else ''
spiral_only='--spiral-only' in sys.argv
out=json.loads(existing.split('window.clockSkyAssets=')[1].split(';\n')[0]) if spiral_only else {}
for name in (['spiral'] if spiral_only else ['galaxy','spiral','mercury','venus','mars','jupiter','saturn','uranus','neptune']):
 file=Path('work/sky-source')/({'galaxy':'milky-way.jpg','spiral':'m101-full.jpg','venus':'venus-natural.jpg'}.get(name,name+'.jpg'))
 im=Image.open(file).convert('RGB')
 if name=='uranus':im=im.crop((0,0,im.width//2,im.height))
 if name=='saturn':im=im.crop((110,125,1800,805))
 if name=='galaxy': im=im.resize((2048,1024),Image.Resampling.LANCZOS)
 elif name=='spiral':
  # Keep the full observed spiral and center its nucleus; do not crop a disc out of an off-center close-up.
  im.thumbnail((448,448),Image.Resampling.LANCZOS)
  left,top=round(256-im.width*.477),round(256-im.height*.514);spiral_box=(left,top,left+im.width,top+im.height)
  padded=Image.new('RGB',(512,512));padded.paste(im,(left,top));im=padded
 else:
  box=im.point(lambda x:255 if x>18 else 0).getbbox()
  if box:im=im.crop(box)
  im.thumbnail((512,512),Image.Resampling.LANCZOS)
 rgba=im.convert('RGBA');pix=rgba.load()
 for y in range(im.height):
  for x in range(im.width):
   r,g,b=im.getpixel((x,y))
   if name=='galaxy':
    edge=min(1,x/(im.width*.10),(im.width-1-x)/(im.width*.10),y/(im.height*.14),(im.height-1-y)/(im.height*.14));a=int(255*max(0,edge)**1.5)
   elif name=='spiral':
    left,top,right,bottom=spiral_box;edge=max(0,min(1,(x-left)/16,(right-1-x)/16,(y-top)/16,(bottom-1-y)/16))
    a=int(255*max(0,min(1,(max(r,g,b)-8)/28))*edge)
   else: a=int(255*max(0,min(1,(max(r,g,b)-3)/14)))
   pix[x,y]=(r,g,b,a)
 target=Path('work/sky-source')/(name+'-bounded.webp');rgba.save(target,'WEBP',quality=90,method=6)
 data=target.read_bytes();out[name]={'src':'data:image/webp;base64,'+base64.b64encode(data).decode(),'width':rgba.width,'height':rgba.height,'bytes':len(data)}
 print(name,rgba.size,len(data))
stars='\nwindow.clockSkyStars='+existing.split('\nwindow.clockSkyStars=',1)[1] if spiral_only and '\nwindow.clockSkyStars=' in existing else ''
asset_file.write_text('// Offline astronomical imagery; full source and adaptation credits: sky-asset-credits.html.\nwindow.clockSkyAssets='+json.dumps(out,separators=(',',':'))+';\n'+stars)
