"""Build neighborhood reference areas from official sector polygons + public CNEFE.

Usage: python scripts/build_territory.py /path/3557006_VOTORANTIM.csv
Requires shapely >= 2.0. Only aggregated counts are written; never address points.
"""
import collections
import csv
import json
import pathlib
import re
import sys
import unicodedata
from shapely import STRtree, make_valid, union_all
from shapely.geometry import Point, shape, mapping

root = pathlib.Path(__file__).resolve().parents[1]
sectors = json.loads((root / 'data/votorantim-setores-ibge-2022.geojson').read_text(encoding='utf-8'))['features']
geometries = [make_valid(shape(f['geometry'])) for f in sectors]
tree = STRtree(geometries)
counts = [collections.Counter() for _ in sectors]
ceps = [collections.Counter() for _ in sectors]
localities = collections.Counter()
locality_ceps = collections.defaultdict(collections.Counter)
postal_localities = collections.defaultdict(collections.Counter)
total = matched = invalid = 0

def normalize(name):
    value = ' '.join(name.strip().upper().split())
    return ''.join(c for c in unicodedata.normalize('NFD', value) if not unicodedata.combining(c))

with open(sys.argv[1], encoding='utf-8-sig', newline='') as source:
    for row in csv.DictReader(source, delimiter=';'):
        total += 1
        name = normalize(row['DSC_LOCALIDADE'])
        if not name:
            invalid += 1
            continue
        locality_ceps[name][row['CEP']] += 1
        if re.fullmatch(r'\d{8}', row['CEP']):
            postal_localities[row['CEP']][name] += 1
        localities[name] += 1
        try:
            point = Point(float(row['LONGITUDE'].replace(',', '.')), float(row['LATITUDE'].replace(',', '.')))
        except (ValueError, TypeError):
            invalid += 1
            continue
        hits = tree.query(point, predicate='intersects')
        if not len(hits):
            continue
        # Boundary points deterministically assigned once, never double counted.
        index = min(hits, key=lambda n: sectors[n]['properties']['cd_setor'])
        counts[index][name] += 1
        ceps[index][row['CEP']] += 1
        matched += 1

groups = collections.defaultdict(list)
assignments = []
for index, feature in enumerate(sectors):
    distribution = counts[index]
    ranked = sorted(distribution.items(), key=lambda item: (-item[1], item[0]))
    dominant, dominant_count = ranked[0] if ranked else ('AREA SEM LOCALIDADE IDENTIFICADA', 0)
    total_in_sector = sum(distribution.values())
    share = round(dominant_count / total_in_sector, 4) if total_in_sector else 0
    assignment = {
        'sectorCode': feature['properties']['cd_setor'], 'neighborhood': dominant,
        'addressCount': total_in_sector, 'dominantShare': share,
        'localities': dict(ranked), 'postalCodes': sorted(ceps[index]),
        'reviewRequired': share < .8 or not total_in_sector,
    }
    assignments.append(assignment)
    groups[dominant].append(index)

features = []
for name, indexes in sorted(groups.items()):
    merged = make_valid(union_all([geometries[index] for index in indexes]))
    if merged.geom_type == 'Polygon':
        from shapely.geometry import MultiPolygon
        merged = MultiPolygon([merged])
    members = [assignments[index] for index in indexes]
    distribution = collections.Counter()
    for index in indexes:
        distribution.update(counts[index])
    features.append({
        'type': 'Feature',
        'properties': {
            'id': 'bairro-' + re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-'),
            'name': name, 'sector': 'Bairros • referência CNEFE 2022',
            'sourceVersion': 'IBGE CNEFE 2022 + malha de setores definitiva v02 • agrupamento por localidade predominante',
            'boundaryStatus': 'reference-area-not-legal-neighborhood-boundary',
            'sectorCodes': [m['sectorCode'] for m in members],
            'localities': dict(distribution.most_common()),
            'postalCodes': sorted(set(cep for m in members for cep in m['postalCodes'])),
            'addressCount': sum(distribution.values()),
            'reviewRequired': any(m['reviewRequired'] for m in members),
            'reviewSectorCount': sum(m['reviewRequired'] for m in members),
        },
        'geometry': mapping(merged),
    })

metadata = {
    'method': 'Spatial join of public CNEFE points to definitive census sectors; whole sectors grouped by most frequent DSC_LOCALIDADE. These are reference areas, not legal neighborhood boundaries.',
    'municipalityCode': '3557006', 'retrievedAt': '2026-10-21',
    'addressRows': total, 'matchedAddressRows': matched, 'invalidRows': invalid,
    'unmatchedAddressRows': total - matched - invalid,
    'sectorCount': len(sectors), 'referenceAreaCount': len(features), 'localityCount': len(localities),
    'cnefeSource': 'https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/35_SP/3557006_VOTORANTIM.zip',
    'sectorSource': 'https://geoservicos.ibge.gov.br/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=CGMAT:qg_2022_600_setcensitario__v02&outputFormat=application/json&srsName=EPSG:4326&CQL_FILTER=cd_mun%3D%273557006%27',
}
directory = [{
    'name': name, 'addressCount': count, 'postalCodes': sorted(locality_ceps[name]),
    'sectorCodes': [a['sectorCode'] for a in assignments if name in a['localities']],
    'dominantSectorCodes': [a['sectorCode'] for a in assignments if a['neighborhood'] == name],
} for name, count in sorted(localities.items())]
complementary = []
for locality in directory:
    if locality['dominantSectorCodes'] or not locality['sectorCodes']:
        continue
    indexes = [index for index, f in enumerate(sectors) if f['properties']['cd_setor'] in locality['sectorCodes']]
    merged = make_valid(union_all([geometries[index] for index in indexes]))
    if merged.geom_type == 'Polygon':
        from shapely.geometry import MultiPolygon
        merged = MultiPolygon([merged])
    complementary.append({'type':'Feature','properties':{
        'id':'bairro-'+re.sub(r'[^a-z0-9]+','-',locality['name'].lower()).strip('-'),
        'name':locality['name'],'sector':'Localidades compartilhadas • CNEFE 2022',
        'sourceVersion':'IBGE CNEFE 2022 • polígonos associados a localidade não predominante',
        'aliasOnly':True,'sectorCodes':locality['sectorCodes'],'reviewRequired':True,
        'boundaryStatus':'shared-reference-area-not-legal-neighborhood-boundary',
    },'geometry':mapping(merged)})
for filename, data in [
    ('votorantim-bairros-referencia-cnefe-2022.geojson', {'type':'FeatureCollection','metadata':metadata,'features':features}),
    ('votorantim-bairros-diretorio.json', {'metadata':metadata,'neighborhoods':directory,'assignments':assignments}),
    ('votorantim-cep-bairros.json', {'metadata':metadata,'postalCodes':{cep:{'localities':[{'name':name,'addressCount':count}for name,count in sorted(distribution.items(),key=lambda item:(-item[1],item[0]))],'addressCount':sum(distribution.values())}for cep,distribution in sorted(postal_localities.items())}}),
    ('votorantim-bairros-complementares.geojson', {'type':'FeatureCollection','metadata':metadata,'features':complementary}),
]:
    (root / 'data' / filename).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(json.dumps(metadata, ensure_ascii=False, indent=2))
assert sum(len(f['properties']['sectorCodes']) for f in features) == 215
assert all(shape(f['geometry']).is_valid for f in features)
assert abs(union_all(geometries).area - union_all([shape(f['geometry']) for f in features]).area) < 1e-10
