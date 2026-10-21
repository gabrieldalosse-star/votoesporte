"""Usage: python scripts/build_light_maps.py public-CNEFE.csv.
Only aggregate CEP centroids are exported; never individual address coordinates.
Requires shapely. Original reference geometries remain untouched.
"""
import csv,json,sys,collections
from pathlib import Path
from shapely.geometry import shape,mapping,Point
from shapely import make_valid

root=Path(__file__).resolve().parents[1]
boundary=shape(json.loads((root/'data/votorantim-limite-municipal-oficial.geojson').read_text(encoding='utf-8'))['features'][0]['geometry'])
for source,target in [('votorantim-bairros-referencia-cnefe-2022.geojson','votorantim-bairros-mapa-leve.geojson'),('votorantim-bairros-complementares.geojson','votorantim-bairros-complementares-leve.geojson')]:
    data=json.loads((root/'data'/source).read_text(encoding='utf-8'))
    for f in data['features']:
        g=make_valid(shape(f['geometry'])).simplify(.00008,preserve_topology=True)
        assert not g.is_empty and g.is_valid
        f['geometry']=mapping(g)
    (root/'data'/target).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(target,(root/'data'/source).stat().st_size,'->',(root/'data'/target).stat().st_size)

groups=collections.defaultdict(list)
with open(sys.argv[1],encoding='utf-8-sig',newline='') as f:
    for row in csv.DictReader(f,delimiter=';'):
        cep=row['CEP']
        if len(cep)!=8 or not cep.isdigit():continue
        try:lat=float(row['LATITUDE'].replace(',','.'));lon=float(row['LONGITUDE'].replace(',','.'))
        except ValueError:continue
        if boundary.covers(Point(lon,lat)):groups[cep].append((lat,lon))
result={}
for cep,positions in groups.items():
    # A CEP with only one source position would reveal that address. Keep pending.
    if len(set(positions))<3:continue
    lat=sum(p[0] for p in positions)/len(positions);lon=sum(p[1] for p in positions)/len(positions)
    if not boundary.covers(Point(lon,lat)):continue
    result[cep]={'latitude':round(lat,4),'longitude':round(lon,4),'addressCount':len(positions)}
(root/'data/votorantim-cep-coordenadas.json').write_text(json.dumps({'metadata':{'source':'IBGE CNEFE 2022 — Votorantim 3557006','method':'Mean of valid address coordinates inside municipality, minimum 3 distinct positions; rounded to 4 decimals','accuracy':'Approximate postal reference, not a home location'},'postalCodes':result},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('CEPs with aggregate reference:',len(result))
