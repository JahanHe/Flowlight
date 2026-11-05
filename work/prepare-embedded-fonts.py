"""Build offline clock-only OFL font subsets. Run: uv run --with 'fonttools[woff]' python work/prepare-embedded-fonts.py"""
import base64, concurrent.futures, hashlib, json, re, urllib.request
from pathlib import Path
from urllib.parse import quote
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib.instancer import instantiateVariableFont

ROOT=Path(__file__).resolve().parent
FONTDIR=ROOT/'fonts'
FONTDIR.mkdir(exist_ok=True)
FONTS=[
 ('inter','Inter','现代简洁 · Inter'),
 ('manrope','Manrope','几何利落 · Manrope'),
 ('nunito','Nunito','柔和圆润 · Nunito'),
 ('montserrat','Montserrat','宽阔几何 · Montserrat'),
 ('jetbrainsmono','JetBrains Mono','代码等宽 · JetBrains Mono'),
 ('bitter','Bitter','经典衬线 · Bitter'),
 ('robotocondensed','Roboto Condensed','紧凑窄体 · Roboto Condensed'),
 ('oxanium','Oxanium','方形科技 · Oxanium'),
]
def download(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Floating-Clock-Font-Build/1.0'})
 with urllib.request.urlopen(req,timeout=30) as response:return response.read()
try: commit=json.loads(download('https://api.github.com/repos/google/fonts/commits/main'))['sha']
except Exception: commit='main'

def prepare(spec):
 id,original,label=spec
 base=f'https://raw.githubusercontent.com/google/fonts/{commit}/ofl/{id}/'
 metadata=download(base+'METADATA.pb').decode()
 license_text=download(base+'OFL.txt').decode()
 assert 'SIL OPEN FONT LICENSE Version 1.1' in license_text, id
 filename=re.search(r'filename: "([^"]+)"',metadata).group(1)
 assert '-Italic' not in filename
 source_url=base+quote(filename,safe='')
 payload=download(source_url)
 (FONTDIR/f'{id}-source.ttf').write_bytes(payload)
 (FONTDIR/f'{id}-OFL.txt').write_text(license_text)
 (FONTDIR/f'{id}-METADATA.pb').write_text(metadata)
 font=TTFont(FONTDIR/f'{id}-source.ttf')
 axes={axis.axisTag:{'min':axis.minValue,'default':axis.defaultValue,'max':axis.maxValue} for axis in font['fvar'].axes}
 assert axes['wght']['min']<=300 and axes['wght']['max']>=800,(id,axes)
 limits={'wght':(300,800)}
 for name,axis in axes.items():
  if name!='wght':limits[name]=min(axis['max'],max(axis['min'],32 if name=='opsz' else axis['default']))
 font=instantiateVariableFont(font,limits,inplace=True,optimize=True)
 # Bake the original font's tabular alternates into the tiny subset so Canvas and CSS use identical numeral widths.
 mapping={}
 if 'GSUB' in font and font['GSUB'].table.FeatureList:
  table=font['GSUB'].table
  for feature in table.FeatureList.FeatureRecord:
   if feature.FeatureTag!='tnum':continue
   for index in feature.Feature.LookupListIndex:
    for subtable in table.LookupList.Lookup[index].SubTable:
     mapping.update(getattr(getattr(subtable,'ExtSubTable',subtable),'mapping',{}))
 mapped=False
 for table in font['cmap'].tables:
  if table.isUnicode():
   for code in range(48,58):
    glyph=table.cmap.get(code)
    if glyph in mapping:table.cmap[code]=mapping[glyph];mapped=True
 # fontTools instancing can omit zero-delta glyphs; an empty tuple list is the correct gvar representation.
 if 'gvar' in font:
  for glyph in font.getGlyphOrder():
   if glyph not in font['gvar'].variations:font['gvar'].variations[glyph]=[]
 family='Floating Clock '+original
 # Use distinct derivative family names; the copyright and OFL name records remain intact.
 replacements={1:family,2:'Regular',3:family+' Digits 1.0',4:family+' Regular',6:family.replace(' ','')+'-Regular',16:family,17:'Regular',18:family+' Regular',25:family.replace(' ','')}
 for record in list(font['name'].names):
  if record.nameID in replacements:font['name'].setName(replacements[record.nameID],record.nameID,record.platformID,record.platEncID,record.langID)
 options=subset.Options()
 options.flavor='woff2'
 options.layout_features=['*']
 options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*']
 subsetter=subset.Subsetter(options=options)
 subsetter.populate(text='0123456789:')
 subsetter.subset(font)
 font.flavor='woff2'
 output=FONTDIR/f'{id}-digits.woff2'
 font.save(output)
 check=TTFont(output)
 cmap=check.getBestCmap()
 assert all(code in cmap for code in range(48,59))
 widths=[check['hmtx'][cmap[code]][0] for code in range(48,58)]
 assert len(set(widths))==1,(id,'not tabular',widths)
 blob=output.read_bytes()
 css=f'@font-face{{font-family:"{family}";font-style:normal;font-weight:300 800;font-display:swap;src:url(data:font/woff2;base64,{base64.b64encode(blob).decode()}) format("woff2");unicode-range:U+0030-003A;}}'
 item={'id':id,'label':label,'family':family,'cssFamily':family,'fallback':'monospace' if id=='jetbrainsmono' else 'serif' if id=='bitter' else 'sans-serif','weight':[300,800],'originalFamily':original,'weightMin':300,'weightMax':800,'sourceAxes':axes,'pinnedAxes':{k:v for k,v in limits.items() if k!='wght'},'tabularDigits':True,'tabularMode':'baked original tnum substitution' if mapped else 'native equal-width digits','unicodeRange':'U+0030-003A','woff2Bytes':len(blob),'sourceURL':source_url,'licenseURL':base+'OFL.txt','metadataURL':base+'METADATA.pb','repositoryURL':f'https://github.com/google/fonts/tree/{commit}/ofl/{id}','sourceSHA256':hashlib.sha256(payload).hexdigest(),'woff2SHA256':hashlib.sha256(blob).hexdigest(),'license':'SIL Open Font License 1.1','modified':'Digits/colon subset, weight range restricted to 300-800, non-weight axes pinned, tabular numeral alternates selected, derivative family renamed.'}
 return item,css,license_text

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 built=list(pool.map(prepare,FONTS))
items=[entry[0] for entry in built]
css='/* Offline numeral-only OFL fonts. Full copyrights and licenses are embedded with the HTML distribution. */\n'+'\n'.join(entry[1] for entry in built)+'\n'
(ROOT/'embedded-fonts.css').write_text(css)
(ROOT/'embedded-fonts.json').write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
notes=['Floating Clock embedded numeral font subsets','Build source: google/fonts official repository; commit '+commit,'Modified versions use distinct Floating Clock family names. Original notices and SIL OFL 1.1 follow.','These fonts are bundled with the clock, not sold independently.']
for item,_,license_text in built:
 notes += ['\n'+'='*72,item['family']+' — derived from '+item['originalFamily'],'Source: '+item['sourceURL'],'License: '+item['licenseURL'],'Modifications: '+item['modified'],'\n'+license_text]
(ROOT/'font-licenses.txt').write_text('\n'.join(notes)+'\n')
assert len(css.encode())<1000000
print(json.dumps({'fonts':[{k:item[k] for k in ['id','family','weightMin','weightMax','woff2Bytes','tabularMode']} for item in items],'woff2Total':sum(item['woff2Bytes'] for item in items),'embeddedCSSBytes':len(css.encode()),'commit':commit},ensure_ascii=False,indent=2))
