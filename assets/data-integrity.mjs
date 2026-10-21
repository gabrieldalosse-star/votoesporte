// Shared by census indicators and regression tests. No database writes.
export function normalizeGender(value) {
  const text = String(value ?? '').trim();
  const key = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (['f', 'feminino'].includes(key)) return 'Feminino';
  if (['m', 'masculino'].includes(key)) return 'Masculino';
  return String(value ?? '');
}

export function identityKey(student) {
  const name = String(student.fullName || student.name || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  let birth = String(student.birthDate || '').trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(birth);
  if (br) birth = `${br[3]}-${br[2]}-${br[1]}`;
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return '';
  return `${name}|${birth}`;
}

export function uniquePeople(rows) {
  // A legacy enrollment and a registered enrollment may refer to the same
  // person. Resolve both identifiers together, including transitive matches.
  const parents = rows.map((_, i) => i), keys = new Map();
  const root = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  rows.forEach(({student}, i) => {
    const id = String(student.globalStudentId || '').trim();
    const identity = identityKey(student);
    for (const key of [id && `id:${id}`, identity && `person:${identity}`].filter(Boolean)) {
      if (keys.has(key)) parents[root(i)] = root(keys.get(key));
      else keys.set(key, i);
    }
  });
  const result = new Map();
  rows.forEach((row, i) => {
    const key = root(i), prior = result.get(key);
    if (!prior || (!prior.student.globalStudentId && row.student.globalStudentId)) result.set(key, row);
  });
  return [...result.values()];
}

export function venueKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function completeVenueDirectory(centers, activities, cataloguePlaces = [], zones = []) {
  const result = centers.map(c => ({...c, aliases: [...(c.aliases || [])]}));
  const labels = new Map();
  result.forEach(c => [c.name, ...c.aliases].forEach(n => labels.set(venueKey(n), c)));
  const locations = [...cataloguePlaces, ...activities.map(c => c.location)].filter(Boolean);
  for (const name of locations) {
    const key = venueKey(name);
    if (labels.has(key)) continue;
    const matching = activities.find(c => venueKey(c.location) === key && c.territoryZoneId);
    const zone = zones.find(z => z.id === matching?.territoryZoneId);
    const entry = {id: `local-${encodeURIComponent(key)}`, name, aliases: [], address: '',
      neighborhood: zone?.name || '', latitude: null, longitude: null,
      positionStatus: 'pending-review', source: 'Cadastro de locais e turmas'};
    result.push(entry); labels.set(key, entry);
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
