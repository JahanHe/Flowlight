from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import re,subprocess,hashlib,tarfile,math
root=Path(__file__).resolve().parent;s=(root/'downloads/openjdk-archive.html').read_text();url=re.findall(r'href="([^"]+openjdk-21[^\"]+macos-aarch64[^\"]+\.tar\.gz)"',s)[0]
archive=root/'downloads/openjdk.tar.gz';prefix=archive.stat().st_size;total=197537405
chunk=math.ceil((total-prefix)/8)
def get(i):
 start=prefix+i*chunk;end=min(total-1,start+chunk-1);dest=root/'downloads'/f'openjdk-part-{i}'
 subprocess.run(['curl','-sS','--fail','--location','--retry','1','--max-time','240','--range',f'{start}-{end}',url,'-o',str(dest)],check=True)
 assert dest.stat().st_size==end-start+1,(i,dest.stat().st_size,end-start+1)
 print('JDK segment',i,'complete',flush=True)
 return dest
with ThreadPoolExecutor(max_workers=8) as pool:parts=list(pool.map(get,range(8)))
with archive.open('ab') as out:
 for p in parts:out.write(p.read_bytes())
want=(root/'downloads/openjdk.sha256').read_text().split()[0];got=hashlib.sha256(archive.read_bytes()).hexdigest();assert want==got,(got,want)
with tarfile.open(archive) as z:z.extractall(root/'openjdk',filter='data')
print('OpenJDK verified and extracted',got,flush=True)
for p in parts:p.unlink()
