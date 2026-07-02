export const EXPRESSIONS = ['neutral', 'happy', 'angry', 'sad', 'surprised', 'smirky'];

export const LOCATIONS = [
  {
    id: 'plaza',
    name: 'Plaza del Pozo',
    asset: 'assets/locations/plaza.png',
    prompt: 'corazon de la aldea, con pozo comunal, mercado pequeno, gallardetes y casas de entramado de madera',
    ambient: 'Campanas lejanas, pregones de mercado y ruedas de carro sobre barro seco.'
  },
  {
    id: 'forja',
    name: 'Forja de Brasa Vieja',
    asset: 'assets/locations/forja.png',
    prompt: 'forja medieval calida, yunques, brasas, herramientas y luz naranja sobre piedra negra',
    ambient: 'El martillo marca el ritmo y el aire huele a carbon, metal y lluvia vieja.'
  },
  {
    id: 'bosque',
    name: 'Linde del Bosque',
    asset: 'assets/locations/bosque.png',
    prompt: 'borde de bosque antiguo con sendero, ruinas cubiertas de musgo y niebla suave',
    ambient: 'Las ramas crujen sin viento y algun pajaro corta el silencio.'
  },
  {
    id: 'taberna',
    name: 'Taberna del Ciervo Partido',
    asset: 'assets/locations/taberna.png',
    prompt: 'interior de taberna medieval con mesas rusticas, chimenea, velas y rincon de rumores',
    ambient: 'Jarras, dados y murmullos. Nadie habla alto cuando se menciona el molino.'
  }
];

export const NPCS = [
  {
    id: 'alcaldesa',
    name: 'Elvira de Robledal',
    role: 'alcaldesa',
    locationId: 'plaza',
    personality: 'diplomatica, calculadora, protectora de la aldea',
    secret: 'sabe que el antiguo recaudador desaparecio con documentos que comprometen al consejo',
    hint: 'revisa el sello roto en los archivos del consejo',
    color: '#7c3f58',
    skin: '#b97855',
    hair: '#2f1e19',
    outfit: 'civic',
    suggestions: ['Preguntar por el consejo', 'Ofrecer ayuda con la aldea', 'Mencionar al recaudador']
  },
  {
    id: 'herrero',
    name: 'Borin Martillopardo',
    role: 'herrero',
    locationId: 'forja',
    personality: 'franco, orgulloso, supersticioso cuando cae la noche',
    secret: 'forjo una llave de hierro negro para alguien encapuchado',
    hint: 'la llave abre una puerta bajo el molino viejo',
    color: '#8b3f2c',
    skin: '#b66e47',
    hair: '#3c2a22',
    outfit: 'smith',
    suggestions: ['Pedir trabajo en la forja', 'Preguntar por la llave negra', 'Hablar de los ruidos nocturnos']
  },
  {
    id: 'curandera',
    name: 'Mara Lunaverde',
    role: 'curandera',
    locationId: 'bosque',
    personality: 'serena, enigmatica, empatica con los marginados',
    secret: 'trata en secreto a una criatura herida del bosque',
    hint: 'busca petalos azules junto a las ruinas cubiertas de musgo',
    color: '#2f6c4f',
    skin: '#9f6246',
    hair: '#472d22',
    outfit: 'healer',
    suggestions: ['Pedir remedios', 'Preguntar por las ruinas', 'Prometer guardar un secreto']
  },
  {
    id: 'posadera',
    name: 'Ines Jarrablanca',
    role: 'posadera',
    locationId: 'taberna',
    personality: 'rapida, mordaz, escucha todo y olvida poco',
    secret: 'oculta cartas de un mensajero que nunca llego al castillo',
    hint: 'la tercera carta menciona una reunion al amanecer',
    color: '#c28a3e',
    skin: '#c6865a',
    hair: '#5b3527',
    outfit: 'innkeeper',
    suggestions: ['Comprar una jarra', 'Preguntar por viajeros', 'Pedir ver las cartas']
  }
];

export function getNpcLocation(npcId, timeOfDay, staticLocationId, npcObj = null) {
  if (npcObj && npcObj.routine && npcObj.routine[timeOfDay]) {
    return npcObj.routine[timeOfDay];
  }

  const routines = {
    alcaldesa: { mañana: 'plaza', tarde: 'plaza', noche: 'casa' },
    herrero: { mañana: 'forja', tarde: 'forja', noche: 'taberna' },
    curandera: { mañana: 'bosque', tarde: 'plaza', noche: 'bosque' },
    posadera: { mañana: 'taberna', tarde: 'taberna', noche: 'taberna' },
    clerigo: { mañana: 'capilla', tarde: 'capilla', noche: 'capilla' },
    molinero: { mañana: 'molinoviejo', tarde: 'molinoviejo', noche: 'molinoviejo' },
    mercader: { mañana: 'mercado', tarde: 'mercado', noche: 'taberna' },
    sepulturero: { mañana: 'cementerio', tarde: 'cementerio', noche: 'taberna' },
    capitan_guardia: { mañana: 'muralla', tarde: 'muralla', noche: 'taberna' },
    anciano: { mañana: 'plaza', tarde: 'plaza', noche: 'casa' },
    granjero: { mañana: 'granja', tarde: 'granja', noche: 'taberna' },
    pescador: { mañana: 'rio', tarde: 'rio', noche: 'casa' },
    inspector_real: { mañana: 'plaza', tarde: 'granja', noche: 'taberna' },
    bardo: { mañana: 'taberna', tarde: 'plaza', noche: 'taberna' },
    carpintero: { mañana: 'taller', tarde: 'taller', noche: 'casa' },
    costurera: { mañana: 'casa', tarde: 'casa', noche: 'casa' },
    cazador: { mañana: 'bosque', tarde: 'mercado', noche: 'casa' },
    emisario: { mañana: 'castillo', tarde: 'castillo', noche: 'castillo' },
    ermitano: { mañana: 'ruinas', tarde: 'ruinas', noche: 'ruinas' },
    huerfano: { mañana: 'plaza', tarde: 'calle', noche: 'taberna' }
  };

  const npcRoutine = routines[npcId];
  if (npcRoutine && npcRoutine[timeOfDay]) {
    return npcRoutine[timeOfDay];
  }
  return staticLocationId || 'plaza';
}

export const CONNECTIONS = {
  plaza: [
    { to: 'mercado', distance: 1 },
    { to: 'taberna', distance: 2 },
    { to: 'calle', distance: 2 },
    { to: 'capilla', distance: 3 }
  ],
  mercado: [
    { to: 'plaza', distance: 1 },
    { to: 'forja', distance: 2 },
    { to: 'panaderiavieja', distance: 2 },
    { to: 'taller', distance: 3 }
  ],
  taberna: [
    { to: 'plaza', distance: 2 },
    { to: 'calle', distance: 2 },
    { to: 'muralla', distance: 3 }
  ],
  calle: [
    { to: 'plaza', distance: 2 },
    { to: 'taberna', distance: 2 },
    { to: 'casa', distance: 1 }
  ],
  capilla: [
    { to: 'plaza', distance: 3 },
    { to: 'cementerio', distance: 2 }
  ],
  cementerio: [
    { to: 'capilla', distance: 2 }
  ],
  forja: [
    { to: 'mercado', distance: 2 }
  ],
  panaderiavieja: [
    { to: 'mercado', distance: 2 }
  ],
  taller: [
    { to: 'mercado', distance: 3 }
  ],
  casa: [
    { to: 'calle', distance: 1 }
  ],
  muralla: [
    { to: 'taberna', distance: 3 },
    { to: 'camino', distance: 5 },
    { to: 'granja', distance: 10 }
  ],
  granja: [
    { to: 'muralla', distance: 10 },
    { to: 'rio', distance: 8 }
  ],
  rio: [
    { to: 'granja', distance: 8 },
    { to: 'bosque', distance: 12 }
  ],
  bosque: [
    { to: 'rio', distance: 12 },
    { to: 'ruinas', distance: 5 },
    { to: 'molinoviejo', distance: 10 }
  ],
  ruinas: [
    { to: 'bosque', distance: 5 }
  ],
  molinoviejo: [
    { to: 'bosque', distance: 10 }
  ],
  camino: [
    { to: 'muralla', distance: 5 },
    { to: 'castillo', distance: 15 }
  ],
  castillo: [
    { to: 'camino', distance: 15 }
  ]
};

export function findPath(startId, endId) {
  if (startId === endId) return [startId];
  
  const queue = [[startId]];
  const visited = new Set([startId]);
  
  while (queue.length > 0) {
    const path = queue.shift();
    const node = path[path.length - 1];
    
    if (node === endId) {
      return path;
    }
    
    const adj = CONNECTIONS[node] || [];
    for (const edge of adj) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push([...path, edge.to]);
      }
    }
  }
  
  return null;
}

export function getPathDistance(path) {
  if (!path || path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const current = path[i];
    const next = path[i + 1];
    const adj = CONNECTIONS[current] || [];
    const conn = adj.find(c => c.to === next);
    total += conn ? conn.distance : 5;
  }
  return total;
}
