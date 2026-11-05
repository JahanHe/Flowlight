from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import xml.etree.ElementTree as E,subprocess,hashlib,zipfile
root=Path(__file__).resolve().parent
jobs=[]
for item in E.parse(root/'downloads/repository3.xml').getroot().findall('remotePackage'):
 if item.get('path')=='emulator' and item.find('channelRef').get('ref')=='channel-0':
  for a in item.findall('archives/archive'):
   if a.findtext('host-os')=='macosx' and a.findtext('host-arch')=='aarch64':
    c=a.find('complete');jobs.append(('emulator.zip','https://dl.google.com/android/repository/'+c.findtext('url'),c.findtext('checksum'),root/'sdk'))
 if item.get('path')=='platform-tools':
  for a in item.findall('archives/archive'):
   if a.findtext('host-os')=='macosx':
    c=a.find('complete');jobs.append(('platform-tools.zip','https://dl.google.com/android/repository/'+c.findtext('url'),c.findtext('checksum'),root/'sdk'))
for item in E.parse(root/'downloads/google-system-images.xml').getroot().findall('remotePackage'):
 if item.get('path')=='system-images;android-34;google_apis;arm64-v8a':
  c=item.find('archives/archive/complete');jobs.append(('system-image.zip','https://dl.google.com/android/repository/sys-img/google_apis/'+c.findtext('url'),c.findtext('checksum'),root/'sdk/system-images/android-34/google_apis'))
def get(job):
 name,url,want,folder=job;p=root/'downloads'/name
 subprocess.run(['curl','-sS','--fail','--location','--retry','2','--max-time','300',url,'-o',str(p)],check=True)
 h=hashlib.sha1()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(1048576),b''):h.update(block)
 assert h.hexdigest()==want,(name,h.hexdigest(),want)
 with zipfile.ZipFile(p) as z:
  for entry in z.infolist():
   z.extract(entry,folder);dest=folder/entry.filename
   if entry.external_attr>>16:dest.chmod(entry.external_attr>>16)
 print(name,'verified and extracted',flush=True)
with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(get,jobs))
