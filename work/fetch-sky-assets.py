from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request
sources={
'm101-full':'https://assets.science.nasa.gov/content/dam/science/missions/hubble/releases/2009/02/STScI-01EVT5S0014XSYMBAATA2CC769.tif/jcr:content/renditions/1280x1280.jpg',
'mercury':'https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia15/pia15162/PIA15162.jpg',
'mars':'https://assets.science.nasa.gov/content/dam/science/psd/mars/resources/detail_files/6/6453_mars-globe-valles-marineris-enhanced-full2.jpg',
'jupiter':'https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/p/i/a/0/PIA04866.jpg',
'saturn':'https://images-assets.nasa.gov/image/PIA11141/PIA11141~large.jpg',
'uranus':'https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia00/pia00032/PIA00032.jpg',
'neptune':'https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/p/i/a/0/PIA01492.jpg',
'venus-natural':'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia10/pia10124/jpeg/PIA10124.jpg?w=1024'}
def fetch(item):
 name,url=item; path=Path('work/sky-source')/(name+'.jpg')
 if not path.exists():
  with urllib.request.urlopen(url,timeout=50) as response: path.write_bytes(response.read())
 print(name,path.stat().st_size)
with ThreadPoolExecutor(max_workers=7) as pool:list(pool.map(fetch,sources.items()))
