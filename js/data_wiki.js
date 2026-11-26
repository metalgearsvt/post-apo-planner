// Wiki-sourced catalog for the Post Apo Tycoon planner. FALLBACK ONLY.
// Source: postapotycoon.fandom.com (Module:Data/Buildings, Tiles, Roads, Pavement pages), Nov 2026.
// js/data.js overlays the data mined from the game (js/gamedata.js) on top of these entries;
// a wiki value is only used where the game data has nothing for that field.
// Planner ids here are permanent: saved plans reference them.

// ---------- Terrain ----------
// group: land | resource | water | special | settlement
export const WIKI_TERRAIN = [
  { id: 'grass',          name: 'Plain',           color: '#7fae4c', group: 'land' },
  { id: 'forest',         name: 'Forest',          color: '#2e6a33', group: 'land', forest: true },
  { id: 'cutforest',      name: 'Cut Forest',      color: '#8b9a5c', group: 'land' },
  { id: 'spoiledforest',  name: 'Spoiled Forest',  color: '#55603a', group: 'land' },
  { id: 'hill',           name: 'Hill',            color: '#a68d5b', group: 'land' },
  { id: 'mountain',       name: 'Big Mountain',    color: '#7a6b5e', group: 'land' },
  { id: 'desert',         name: 'Desert',          color: '#e1c67a', group: 'land' },
  { id: 'barren',         name: 'Barren',          color: '#b8a888', group: 'land' },
  { id: 'swamp',          name: 'Swamp',           color: '#5d7856', group: 'land' },
  { id: 'rubble',         name: 'Rubble',          color: '#8e857a', group: 'land' },
  { id: 'scorched',       name: 'Scorched Earth',  color: '#4b3c36', group: 'land' },
  { id: 'disrupted',      name: 'Disrupted Earth', color: '#9b806b', group: 'land' },
  { id: 'ruins',          name: 'Ruins / Wreck',   color: '#6f665e', group: 'land' },
  { id: 'rift',           name: 'Rift',            color: '#5c4b70', group: 'special' },
  { id: 'largerift',      name: 'Large Rift',      color: '#45375a', group: 'special' },
  { id: 'lavarift',       name: 'Lava Rift',       color: '#c4481f', group: 'special' },
  { id: 'goldenfield',    name: 'Golden Field',    color: '#e8b923', group: 'resource' },
  { id: 'gemfield',       name: 'Gem Field',       color: '#b35cd5', group: 'resource' },
  { id: 'copperfield',    name: 'Copper Field',    color: '#c97634', group: 'resource' },
  { id: 'groundoil',      name: 'Ground Oil',      color: '#3a3a3a', group: 'resource' },
  { id: 'thermalspot',    name: 'Thermal Spot',    color: '#e57d3a', group: 'resource' },
  { id: 'uraniumfield',   name: 'Uranium Field',   color: '#9bdc3a', group: 'resource' },
  { id: 'river',          name: 'River',           color: '#5aaad9', group: 'water', water: true },
  { id: 'water',          name: 'Water',           color: '#2e7ec0', group: 'water', water: true },
  { id: 'deepwater',      name: 'Deep Water',      color: '#1d4e89', group: 'water', water: true },
  { id: 'wateroil',       name: 'Water Oil',       color: '#24375c', group: 'water', water: true },
  { id: 'gemrock',        name: 'Gem Rock',        color: '#6b5bd0', group: 'water', water: true },
  { id: 'shipwreck',      name: 'Shipwreck',       color: '#4c5e70', group: 'water', water: true },
  { id: 'mainsettlement', name: 'Main Settlement', color: '#d74a4a', group: 'settlement', settlement: true },
  { id: 'settlement',     name: 'Settlement',      color: '#e27a6a', group: 'settlement', settlement: true },
  { id: 'megacity',       name: 'Mega City',       color: '#b02e60', group: 'settlement', settlement: true },
  { id: 'bunker',         name: 'Bunker',          color: '#6d6d6d', group: 'settlement' },
  { id: 'unknown',        name: 'Unexplored',      color: '#1f2226', group: 'special' },
];

// Standard buildable land used by most buildings.
export const LAND = ['grass', 'barren', 'desert', 'rubble', 'groundoil', 'copperfield'];
export const HILLS = ['hill', 'mountain'];
export const SEA = ['water', 'deepwater'];
export const RIFTS = ['rift', 'largerift'];

// ---------- Buildings ----------
// power: net energy (+ produces, - consumes). poll: pollution (+ adds, - removes).
// income: per 9 seconds unless noted. radius: gathering / effect range (square, Chebyshev).
// rules: special placement checks implemented in app.js.
// road: false => doesn't need a road connection. pave: pavement bonus {mult, on}.
const B = (o) => o; // readability helper

export const WIKI_BUILDINGS = [
  // Roads (gold income per tile shown as income.gold)
  B({ id: 'dirt_road', color: '#a88a5e', name: 'Dirt Road',    cat: 'Roads', lvl: 1,  cost: { gold: 300 }, tiles: LAND, road: false, isRoad: true, abbr: '' }),
  B({ id: 'paved_road', color: '#a3a39e', name: 'Paved Road',   cat: 'Roads', lvl: 12, cost: { gold: 500, stone: 50 }, income: { gold: 1 }, tiles: LAND, road: false, isRoad: true, abbr: '' }),
  B({ id: 'basic_road', color: '#7b7f86', name: 'Basic Road',   cat: 'Roads', lvl: 26, cost: { gold: 11000, stone: 350 }, income: { gold: 2 }, poll: 1, tiles: LAND, road: false, isRoad: true, abbr: '' }),
  B({ id: 'street_road', color: '#5d6168', name: 'Street Road',  cat: 'Roads', lvl: 34, cost: { gold: 70000, stone: 20000 }, income: { gold: 3 }, poll: 2, tiles: LAND, road: false, isRoad: true, abbr: '' }),
  B({ id: 'fast_road', color: '#3f434a', name: 'Fast Road',    cat: 'Roads', lvl: 62, cost: { gold: 550000, stone: 40000 }, income: { gold: 5 }, poll: 5, tiles: ['grass'], road: false, isRoad: true, abbr: '', desc: 'Plains only.' }),
  B({ id: 'eco_road', color: '#5e8a62', name: 'Eco Road',     cat: 'Roads', lvl: 89, cost: { gold: 9000000, steel: 300000 }, income: { gold: 5 }, poll: 3, tiles: LAND, road: false, isRoad: true, abbr: '' }),
  B({ id: 'river_bridge', color: '#b7905c', name: 'River Bridge', cat: 'Roads', lvl: 1,  cost: { gold: 6500 }, tiles: ['river'], road: false, isRoad: true, abbr: '', desc: 'Bridge over a river. Higher tiers cost more (Paved 7.5k, Basic 60k, Street 355k, Fast 2.75M, Eco 45M).' }),
  B({ id: 'sea_bridge_t1', color: '#c9c2b4', name: 'Sea Bridge T1', cat: 'Roads', lvl: 46, cost: { gold: 1400000, stone: 350000, steel: 140000 }, income: { gold: 3 }, poll: 2, tiles: SEA, road: false, isRoad: true, abbr: '', desc: 'Sea bridges cannot turn corners — must be a straight line.' }),
  B({ id: 'sea_bridge_t2', color: '#c9c2b4', name: 'Sea Bridge T2', cat: 'Roads', lvl: 62, cost: { gold: 11000000, stone: 550000, steel: 550000 }, income: { gold: 5 }, poll: 5, tiles: SEA, road: false, isRoad: true, abbr: '' }),
  B({ id: 'sea_bridge_t3', color: '#c9c2b4', name: 'Sea Bridge T3', cat: 'Roads', lvl: 89, cost: { gold: 225000000, stone: 4500000, steel: 4500000 }, income: { gold: 5 }, poll: 3, tiles: SEA, road: false, isRoad: true, abbr: '' }),

  // Gold
  B({ id: 'gold_mine', name: 'Gold Mine', cat: 'Gold', lvl: 5, cost: { gold: 35000 }, income: { gold: 100 }, tiles: ['goldenfield'], abbr: 'GM', pave: { mult: 0.10, on: 'income' } }),
  B({ id: 'advanced_gold_mine', name: 'Advanced Gold Mine', cat: 'Gold', lvl: 31, cost: { steel: 50000, chips: 7000 }, power: -50, poll: 5, income: { gold: 250 }, tiles: ['goldenfield'], abbr: 'AGM', pave: { mult: 0.10, on: 'income' } }),
  B({ id: 'heavy_gold_mine', name: 'Heavy Gold Mine', cat: 'Gold', lvl: 58, cost: { steel: 2000000, chips: 6000000 }, power: -170, poll: 35, tiles: ['goldenfield'], abbr: 'HGM', pave: { mult: 0.10, on: 'income' }, desc: 'Income not listed on wiki — set it in the Catalog editor.' }),
  B({ id: 'dual_gold_mine', name: 'Dual Gold Mine', cat: 'Gold', lvl: 100, cost: { steel: 15000000, uranium: 90000 }, power: -600, poll: 135, income: { gold: 1500 }, tiles: ['goldenfield'], abbr: 'DGM', pave: { mult: 0.15, on: 'income' } }),
  B({ id: 'special_gold_mine', name: 'Special Gold Mine', cat: 'Gold', lvl: 8, cost: { gems: 50 }, income: { gold: 100 }, tiles: ['goldenfield'], premium: true, abbr: 'SGM' }),
  B({ id: 'premium_gold_mine', name: 'Premium Gold Mine', cat: 'Gold', lvl: 59, cost: { gems: 80 }, power: -10, poll: 10, tiles: ['goldenfield'], premium: true, abbr: 'PGM', pave: { mult: 0.10, on: 'income' } }),
  B({ id: 'complex_gold_mine', name: 'Complex Gold Mine', cat: 'Gold', lvl: 102, cost: { gems: 180 }, power: -500, poll: 120, income: { gold: 1000, chips: 700, steel: 300 }, tiles: ['goldenfield'], premium: true, abbr: 'CGM' }),
  B({ id: 'eco_gold_mine', name: 'Eco Gold Mine', cat: 'Gold', lvl: 130, cost: { gems: 130 }, income: { gold: 850 }, tiles: ['goldenfield'], premium: true, abbr: 'EGM' }),
  B({ id: 'titanium_dual_gold_mine', name: 'Titanium Dual Gold Mine', cat: 'Gold', lvl: 142, cost: { titanium: 2800000 }, power: -600, poll: 130, income: { gold: 1100 }, tiles: ['goldenfield'], abbr: 'TDG' }),
  B({ id: 'titanium_eco_gold_mine', name: 'Titanium Eco Gold Mine', cat: 'Gold', lvl: 153, cost: { titanium: 3400000 }, poll: 30, income: { gold: 1200 }, tiles: ['goldenfield'], abbr: 'TEG' }),
  B({ id: 'titanium_complex_gold_mine', name: 'Titanium Complex Gold Mine', cat: 'Gold', lvl: 157, cost: { titanium: 4100000 }, power: -500, poll: 170, income: { gold: 1200, chips: 700, steel: 300 }, tiles: ['goldenfield'], abbr: 'TCG' }),

  // Lumber
  B({ id: 'lumbermill', name: 'Lumber Mill', cat: 'Lumber', lvl: 8, cost: { gold: 8000 }, income: { lumber: 1 }, tiles: LAND, radius: 1, radiusKind: 'lumber', roadlessUpg: true, abbr: 'LM', desc: 'Produces Lumber from Forest within 1 tile. Stores 500.' }),
  B({ id: 'industrialmill', name: 'Industrial Mill', cat: 'Lumber', lvl: 25, cost: { gold: 190000, stone: 35000 }, power: -20, poll: 15, income: { lumber: 2 }, tiles: LAND, radius: 1, radiusKind: 'lumber', roadlessUpg: true, abbr: 'IM', desc: 'Stores 1,500 lumber. Radius assumed 1.' }),
  B({ id: 'premiummill', name: 'Premium Mill', cat: 'Lumber', lvl: 66, cost: { gems: 79 }, income: { lumber: 7 }, tiles: LAND, radius: 3, radiusKind: 'lumber', road: false, premium: true, abbr: 'PM', desc: 'Gathers from Forest within 3 tiles. Stores 25,000.' }),
  B({ id: 'dronemill', name: 'Drone Mill', cat: 'Lumber', lvl: 118, cost: { steel: 42000000, chips: 270000000 }, uranium: -1, income: { lumber: 1200 }, tiles: LAND, abbr: 'DM', pave: { mult: 0.40, on: 'income' }, desc: 'Produces lumber from anywhere in the world.' }),
  B({ id: 'lumberpile', name: 'Lumber Pile', cat: 'Lumber', lvl: 14, cost: { gold: 14000, lumber: 400 }, tiles: LAND, abbr: 'LP', desc: 'Stores more lumber. Pavement: +100% storage.' }),

  // Farms
  B({ id: 'farm', name: 'Farm', cat: 'Farms', lvl: 6, cost: { gold: 3000 }, tiles: LAND, radius: 2, radiusKind: 'farm', fieldFood: 1, roadlessUpg: true, abbr: 'F', desc: 'Places Farm Fields on free buildable tiles within 2 tiles; each field = 1 food.' }),
  B({ id: 'bigfarm', name: 'Big Farm', cat: 'Farms', lvl: 43, cost: { gold: 800000, lumber: 95000 }, power: -3, tiles: LAND, radius: 2, radiusKind: 'farm', fieldFood: 1, roadlessUpg: true, abbr: 'BF', desc: 'Places Advanced Farm Fields on free buildable tiles within its radius.' }),
  B({ id: 'silo', name: 'Silo', cat: 'Farms', lvl: 36, cost: { lumber: 14000, steel: 7000 }, tiles: LAND, abbr: 'Si', desc: 'Food storage.' }),
  B({ id: 'biodome', name: 'Bio-Dome', cat: 'Farms', lvl: 126, power: -50, poll: -10, income: { food: 350 }, tiles: ['grass'], abbr: 'BD', pave: { mult: 0.40, on: 'income' } }),
  B({ id: 'superbiodome', name: 'Super Bio-Dome', cat: 'Farms', power: 390, poll: -120, income: { food: 2800 }, tiles: ['grass'], abbr: 'SBD', desc: 'Wiki listed +390 net power; game data says it drains 60 power and earns 450 gold.' }),

  // Power
  B({ id: 'coalplant', name: 'Coal Plant', cat: 'Power', lvl: 20, cost: { gold: 78000, lumber: 7000, stone: 20000 }, power: 150, poll: 80, tiles: LAND, rules: ['nearWater2'], abbr: 'CP', pave: { mult: 0.40, on: 'power' }, desc: 'Must be near Water or River (see the radius shown when placing).' }),
  B({ id: 'solarpanel', name: 'Solar Panels', cat: 'Power', lvl: 41, cost: { gold: 470000, steel: 8000, chips: 95000 }, power: 10, tiles: LAND, abbr: 'SP', pave: { mult: 2.0, on: 'power' } }),
  B({ id: 'goldsolarpanel', name: 'Gold-Plated Solar Panels', cat: 'Power', power: 500, income: { gold: 2000 }, tiles: LAND, premium: true, abbr: 'GSP', desc: 'Event / sale only.' }),
  B({ id: 'seagenerator', name: 'Sea Generator', cat: 'Power', lvl: 21, cost: { gems: 40 }, power: 75, poll: -20, tiles: SEA, premium: true, road: false, abbr: 'SG' }),
  B({ id: 'triplegenerator', name: 'Triple Generator', cat: 'Power', lvl: 94, cost: { gems: 150 }, power: 315, poll: -35, tiles: SEA, premium: true, road: false, abbr: 'TG' }),
  B({ id: 'windmill', name: 'Windmill', cat: 'Power', lvl: 39, cost: { gold: 360000, steel: 22000, chips: 20000 }, power: 20, poll: 1, tiles: HILLS, abbr: 'W' }),
  B({ id: 'advancedwindmill', name: 'Advanced Windmill', cat: 'Power', lvl: 72, cost: { gold: 360000, steel: 22000, chips: 20000 }, power: 28, tiles: HILLS, abbr: 'AW' }),
  B({ id: 'modernwindmill', name: 'Modern Windmill', cat: 'Power', lvl: 128, cost: { steel: 15000000, chips: 40000000 }, power: 35, poll: -2, tiles: HILLS, abbr: 'MW' }),
  B({ id: 'thermalplant', name: 'Thermal Plant', cat: 'Power', lvl: 57, cost: { gold: 4500000, steel: 450000, chips: 3500000 }, power: 350, poll: 5, tiles: ['thermalspot'], abbr: 'TP', pave: { mult: 0.20, on: 'power' } }),
  B({ id: 'uraniumpowerplant', name: 'Uranium Power Plant', cat: 'Power', lvl: 97, cost: { gold: 750000000, steel: 120000000, uranium: 650000 }, power: 1400, poll: 520, tiles: ['uraniumfield'], abbr: 'UPP', desc: 'Emits a radiation cloud.' }),

  // Stone & Steel
  B({ id: 'stone_mine', name: 'Stone Mine', cat: 'Stone & Steel', lvl: 12, cost: { gold: 35000, lumber: 300 }, poll: 2, income: { stone: 10 }, tiles: HILLS, abbr: 'SM' }),
  B({ id: 'mk2_stone_mine', name: 'MK2 Stone Mine', cat: 'Stone & Steel', lvl: 44, cost: { gold: 1400000, steel: 50000, chips: 120000 }, power: -35, poll: 5, income: { stone: 25 }, tiles: HILLS, abbr: 'SM2' }),
  B({ id: 'sea_stone_mine', name: 'Sea Stone Mine', cat: 'Stone & Steel', lvl: 76, cost: { uranium: 30, gold: 3300000, steel: 50000 }, uranium: -1, poll: 10, income: { stone: 45 }, tiles: SEA, road: false, abbr: 'SSM' }),
  B({ id: 'stone_conveyor', name: 'Stone Conveyor', cat: 'Stone & Steel', lvl: 13, cost: { gems: 25 }, tiles: LAND, premium: true, rules: ['adjStoneMine'], abbr: 'SC', desc: 'Adjacent Stone Mines / MK2 Stone Mines generate +200% stone.' }),
  B({ id: 'mega_stone_conveyor', name: 'Mega Stone Conveyor', cat: 'Stone & Steel', lvl: 121, cost: { gems: 175 }, tiles: LAND, premium: true, rules: ['adjStoneMine'], abbr: 'MSC', desc: 'Adjacent Stone Mines / MK2 Stone Mines generate +200% stone.' }),
  B({ id: 'hybrid_mine', name: 'Hybrid Mine', cat: 'Stone & Steel', lvl: 1, power: -2, poll: 1, income: { stone: 30, gold: 5 }, tiles: HILLS, premium: true, rules: ['needFoundry3'], abbr: 'HM', desc: 'Stone + 2x the iron of a normal Iron Mine. Event / pack only.' }),
  B({ id: 'iron_mine', name: 'Iron Mine', cat: 'Stone & Steel', lvl: 24, cost: { gold: 95000 }, power: -3, poll: 5, tiles: HILLS, rules: ['needFoundry3'], abbr: 'IrM', desc: 'Produces iron ore — needs a Foundry within 3 tiles.' }),
  B({ id: 'mk2_iron_mine', name: 'MK2 Iron Mine', cat: 'Stone & Steel', lvl: 26, cost: { gems: 35 }, power: -2, tiles: HILLS, premium: true, rules: ['needFoundry3'], abbr: 'Ir2', desc: 'Needs a Foundry within 3 tiles.' }),
  B({ id: 'foundry', name: 'Foundry', cat: 'Stone & Steel', lvl: 24, cost: { gold: 415000, stone: 52000 }, power: -25, poll: 65, tiles: LAND, radius: 3, radiusKind: 'foundry', foundry: true, steelPerMine: 10, abbr: 'Fo', desc: 'Turns iron ore from Iron Mines within 3 tiles into Steel (10 per mine).' }),
  B({ id: 'heavy_foundry', name: 'Heavy Foundry', cat: 'Stone & Steel', lvl: 54, cost: { gold: 3200000, steel: 500000, chips: 2000000 }, power: -250, poll: 300, tiles: LAND, radius: 3, radiusKind: 'foundry', foundry: true, abbr: 'HFo', desc: 'Faster foundry. Iron Mines within 3 tiles.' }),
  B({ id: 'eco_foundry', name: 'Eco Foundry', cat: 'Stone & Steel', lvl: 95, cost: { gold: 165000000, steel: 15500000, chips: 80000000 }, power: -950, poll: -10, tiles: LAND, radius: 3, radiusKind: 'foundry', foundry: true, abbr: 'EFo' }),
  B({ id: 'steel_storage', name: 'Steel Storage', cat: 'Stone & Steel', lvl: 29, cost: { gold: 190000, steel: 15000 }, poll: 3, tiles: LAND, abbr: 'StS' }),

  // Microchips
  B({ id: 'chipfactory', name: 'Chip Factory', cat: 'Microchips', lvl: 28, cost: { gold: 2500000 }, power: -200, poll: 75, income: { chips: 80 }, tiles: ['copperfield'], abbr: 'CF' }),
  B({ id: 'heavychipfactory', name: 'Heavy Chip Factory', cat: 'Microchips', lvl: 57, cost: { gold: 75000000, steel: 3500000 }, power: -700, poll: 400, income: { chips: 200 }, tiles: ['copperfield'], abbr: 'HCF' }),
  B({ id: 'spaceagefactory', name: 'Space Age Factory', cat: 'Microchips', lvl: 70, cost: { cytrium: 1300, chips: 13000000 }, power: -200, poll: 100, income: { gold: 300, chips: 90 }, tiles: ['copperfield'], abbr: 'SAF' }),

  // Oil
  B({ id: 'onshoreoilrig', name: 'Onshore Oil Rig', cat: 'Oil', lvl: 32, cost: { gold: 820000, chips: 1000 }, power: -10, poll: 10, income: { oil: 10 }, tiles: ['groundoil'], abbr: 'OR', pave: { mult: 1.0, on: 'income' }, desc: 'Stores 1,000 oil.' }),
  B({ id: 'offshoreoilrig', name: 'Offshore Oil Rig', cat: 'Oil', lvl: 39, cost: { gold: 255000 }, power: -25, poll: 60, income: { oil: 20 }, tiles: ['wateroil'], road: false, abbr: 'OOR', desc: 'Stores 5,000 oil. Boosted +100% by a Tanker in range.' }),
  B({ id: 'riftoilrig', name: 'Rift Oil Miner', cat: 'Oil', lvl: 33, cost: { gems: 40 }, power: -5, poll: 3, tiles: RIFTS, premium: true, abbr: 'ROM' }),
  B({ id: 'oilstorage', name: 'Oil Storage', cat: 'Oil', lvl: 36, cost: { gold: 145000, steel: 24000 }, tiles: LAND, abbr: 'OS' }),
  B({ id: 'tanker', name: 'Tanker', cat: 'Oil', lvl: 42, cost: { gold: 1500000, steel: 30000, oil: 10000 }, poll: 5, tiles: SEA, road: false, radius: 7, radiusKind: 'tanker', abbr: 'Tk', desc: 'Offshore Oil Rigs within its radius produce +100% oil.' }),

  // Uranium
  B({ id: 'uraniumrefinery', name: 'Uranium Refinery', cat: 'Uranium', lvl: 75, cost: { gold: 80000000, steel: 1500000, chips: 30000000 }, power: -100, poll: 400, income: { uranium: 3 }, tiles: ['uraniumfield'], abbr: 'UR' }),
  B({ id: 'ubatterystorage', name: 'U-Battery Storage', cat: 'Uranium', lvl: 77, cost: { gold: 10000000, steel: 200000 }, poll: 300, tiles: LAND, abbr: 'UBS' }),

  // Gems
  B({ id: 'gem_mine', name: 'Gem Mine', cat: 'Gems', lvl: 30, cost: { gold: 5000000 }, power: -200, poll: 50, tiles: ['gemfield'], abbr: 'GeM', desc: 'Produces gems daily.' }),
  B({ id: 'super_factory', name: 'Super Factory', cat: 'Gems', lvl: 65, cost: { gold: 500000000, chips: 20000000 }, power: -500, poll: 350, income: { gold: 5000 }, tiles: ['gemfield'], abbr: 'SF', pave: { mult: 0.40, on: 'income' }, desc: 'Daily gems + superclickers, plus gold.' }),
  B({ id: 'dual_super_factory', name: 'Dual Super Factory', cat: 'Gems', lvl: 132, cost: { steel: 500000000, chips: 1400000000 }, power: -1500, poll: 950, income: { gold: 10000 }, tiles: ['gemfield'], abbr: 'DSF' }),

  // Storage
  B({ id: 'storagecontainer', name: 'Storage Container', cat: 'Storage', lvl: 27, cost: { gold: 55000, steel: 12000 }, tiles: LAND, rules: ['adjContainer'], abbr: 'SCo', desc: 'Adjacent Storage Containers +100% capacity. Stores stone 1,500 / steel 1,000 / chips 3,000.' }),
  B({ id: 'storagecrane', name: 'Storage Crane', cat: 'Storage', lvl: 45, cost: { steel: 35000, chips: 55000 }, power: -12, poll: 20, tiles: LAND, abbr: 'SCr' }),
  B({ id: 'premiumstorage', name: 'Premium Storage', cat: 'Storage', lvl: 32, cost: { gems: 30 }, tiles: LAND, premium: true, abbr: 'PS' }),
  B({ id: 'ecostorage', name: 'Eco Storage', cat: 'Storage', lvl: 68, cost: { gems: 110 }, power: -10, poll: -2, tiles: LAND, premium: true, abbr: 'ES' }),
  B({ id: 'riftstorage', name: 'Rift Storage', cat: 'Storage', lvl: 111, cost: { steel: 45000000, uranium: 500000 }, power: -70, poll: 4, tiles: RIFTS, abbr: 'RS' }),

  // Shipyards
  B({ id: 'small_shipyard', name: 'Small Shipyard', cat: 'Shipyards', lvl: 15, cost: { gold: 52000, lumber: 1200 }, poll: 5, tiles: SEA, abbr: 'SY', desc: '+1 sea discovery range, +1 fishing boat.' }),
  B({ id: 'heavy_shipyard', name: 'Heavy Shipyard', cat: 'Shipyards', lvl: 38, cost: { gold: 1752000, stone: 30000, steel: 45000 }, power: -150, poll: 75, tiles: SEA, rules: ['adjSettlementBonus'], settleBonus: { gold: 150 }, abbr: 'HSY', desc: '+4 boats. +150 gold if adjacent to a settlement.' }),
  B({ id: 'shipyard_market', name: 'Shipyard Market', cat: 'Shipyards', power: -30, poll: 40, tiles: SEA, premium: true, rules: ['adjSettlementBonus'], settleBonus: { gold: 600 }, abbr: 'SYM', desc: '+4 boats. +600 gold if adjacent to a settlement.' }),
  B({ id: 'mega_shipyard', name: 'Mega Shipyard', cat: 'Shipyards', lvl: 167, cost: { steel: 300000000, cytrium: 14500 }, power: 100, poll: 200, tiles: SEA, abbr: 'MSY', desc: '+5 discovery range, +25 boats. Gold scales with total shipyards.' }),
  B({ id: 'shipyard_storage', name: 'Shipyard Storage', cat: 'Shipyards', lvl: 61, cost: { gold: 2400000, steel: 95000, chips: 75000 }, power: -25, poll: 35, tiles: SEA, abbr: 'SYS' }),

  // Cleaners
  B({ id: 'rivercleaner', name: 'River Cleaner', cat: 'Cleaners', lvl: 22, cost: { gold: 92000 }, poll: -8, tiles: ['river'], road: false, abbr: 'RC' }),
  B({ id: 'microcleaner', name: 'Micro Cleaner', cat: 'Cleaners', lvl: 63, cost: { gold: 6500000, chips: 750000 }, poll: -20, tiles: ['river'], road: false, abbr: 'MC' }),
  B({ id: 'citrhodiumcleaner', name: 'Citrhodium Cleaner', cat: 'Cleaners', lvl: 107, cost: { gold: 150000000, cytrium: 1600 }, power: 90, poll: -80, tiles: ['river'], road: false, abbr: 'CC' }),
  B({ id: 'massive_air_cleaner', name: 'Massive Air Cleaner', cat: 'Cleaners', lvl: 40, power: -30, poll: -160, tiles: [...LAND, 'thermalspot'], premium: true, rules: ['airCleanerThermal'], abbr: 'MAC', desc: 'On a Thermal Spot: no power drain and -300 pollution.' }),
  B({ id: 'filterarray', name: 'Filter Array', cat: 'Cleaners', lvl: 91, cost: { gold: 110000000, chips: 70000000 }, poll: -60, tiles: ['grass'], abbr: 'FA' }),

  // Scouting
  B({ id: 'scouttower', name: 'Scout Tower', cat: 'Scouting', lvl: 3, cost: { gold: 2000 }, tiles: ['grass', 'hill'], radius: 5, radiusKind: 'reveal', abbr: 'ST', desc: 'Reveals tiles within its radius.' }),
  B({ id: 'sensortower', name: 'Sensor Tower', cat: 'Scouting', lvl: 28, cost: { gold: 125000, steel: 20000 }, tiles: ['grass', 'hill', ...LAND.slice(1)], radius: 8, radiusKind: 'reveal', abbr: 'SeT', desc: 'Reveals tiles within its radius; detects copper within 5.' }),
  B({ id: 'radar', name: 'Radar', cat: 'Scouting', lvl: 91, cost: { gold: 150000000, chips: 50000000 }, power: -30, poll: 40, tiles: ['grass'], premium: true, abbr: 'Rd' }),

  // Trees (placeable forests)
  B({ id: 'small_forest', name: 'Small Forest', cat: 'Trees', lvl: 1, cost: { gold: 300 }, poll: -1, income: { gold: 1 }, tiles: LAND, road: false, forest: true, abbr: '' }),
  B({ id: 'dense_forest', name: 'Dense Forest', cat: 'Trees', lvl: 11, cost: { gold: 8500 }, poll: -2, income: { gold: 2 }, tiles: LAND, road: false, forest: true, abbr: '' }),
  B({ id: 'deep_forest', name: 'Deep Forest', cat: 'Trees', lvl: 51, cost: { gold: 140000 }, poll: -3, income: { gold: 4 }, tiles: LAND, road: false, forest: true, abbr: '' }),
  B({ id: 'thick_forest', name: 'Thick Forest', cat: 'Trees', lvl: 92, cost: { gold: 10000000 }, poll: -4, income: { gold: 6 }, tiles: LAND, road: false, forest: true, abbr: '' }),
  B({ id: 'tall_forest', name: 'Tall Forest', cat: 'Trees', poll: -5, income: { gold: 7 }, tiles: LAND, road: false, forest: true, premium: true, abbr: '' }),
  B({ id: 'sequoia', name: 'Sequoia', cat: 'Trees', poll: -15, income: { gold: 8 }, tiles: LAND, road: false, forest: true, premium: true, abbr: '' }),
  B({ id: 'palmtree', name: 'Coconut Palms', cat: 'Trees', poll: -10, income: { gold: 9, food: 5 }, tiles: LAND, road: false, premium: true, abbr: '', desc: 'Mills cannot harvest wood here.' }),
  B({ id: 'mangrove', name: 'Mangrove', cat: 'Trees', poll: -10, income: { gold: 9 }, tiles: SEA, road: false, premium: true, abbr: '', desc: 'Trees on water.' }),
  B({ id: 'bamboo', name: 'Bamboo', cat: 'Trees', poll: -10, income: { gold: 9 }, tiles: LAND, road: false, forest: true, premium: true, abbr: '' }),
  B({ id: 'sakura', name: 'Sakura', cat: 'Trees', poll: -8, income: { gold: 11 }, tiles: LAND, road: false, forest: true, premium: true, abbr: '' }),
  B({ id: 'winterforest', name: 'Winter Forest', cat: 'Trees', poll: -10, income: { gold: 9 }, tiles: LAND, road: false, forest: true, premium: true, abbr: '' }),
  B({ id: 'specialforest', name: 'Special Forest', cat: 'Trees', poll: -70, income: { gold: 50 }, tiles: LAND, road: false, premium: true, abbr: '', desc: 'Also 1 gem per day.' }),

  // Rail & other
  B({ id: 'trainstation', name: 'Train Station', cat: 'Rail & Other', lvl: 46, cost: { gold: 15000000, steel: 135000 }, power: -120, poll: 180, tiles: ['grass'], radius: 5, radiusKind: 'collect', abbr: 'TS', desc: 'Not next to a Mega City: collects extra resources from buildings within 5 tiles.' }),
  B({ id: 'rail', name: 'Rail', cat: 'Rail & Other', lvl: 46, cost: { gold: 50000, steel: 3000, stone: 5000 }, poll: 2, tiles: LAND, road: false, isRail: true, abbr: '' }),
  B({ id: 'pavement', name: 'Pavement', cat: 'Rail & Other', lvl: 40, tiles: LAND, premium: true, isPavement: true, abbr: '', desc: 'Underlay: buildings placed on Pavement get a production bonus. Use the Pavement tool to lay it under buildings.' }),
  B({ id: 'replicator', name: 'Replicator', cat: 'Rail & Other', power: -800, poll: 300, tiles: LAND, abbr: 'Rep', desc: '+1% passive event-currency income.' }),

  // Unverified (wiki "pending entries")
  B({ id: 'deepwater_reactor', name: 'Deepwater Reactor', cat: 'Unverified', power: 3200, poll: 120, tiles: SEA, road: false, rules: ['allWater2'], radius: 2, radiusKind: 'rule', premium: true, abbr: 'DWR', desc: 'All tiles within 2 must be water. 35,000 U-battery storage.' }),
  B({ id: 'small_suburb', name: 'Small Suburb', cat: 'Unverified', lvl: 114, cost: { steel: 140000000, uranium: 550000 }, power: -200, poll: 100, income: { gold: 300 }, tiles: LAND, rules: ['adjMegaOrSuburb'], abbr: 'Sub', desc: 'Must be adjacent to a Mega City or another Suburb. +50,000 population.' }),
  B({ id: 'rift_uranium_digger', name: 'Rift Uranium Digger', cat: 'Unverified', lvl: 116, uranium: -4, power: -100, poll: 300, income: { gold: 840 }, tiles: RIFTS, abbr: 'RUD' }),
  B({ id: 'railside_panels', name: 'Railside Panels', cat: 'Unverified', lvl: 117, power: 14, poll: 2, tiles: LAND, rules: ['adjRail'], abbr: 'RP', desc: 'Placed by the rails.' }),
  B({ id: 'utopia_spire', name: 'Utopia Spire', cat: 'Unverified', power: -3000, poll: -50, income: { gold: 35000 }, tiles: LAND, abbr: 'US' }),
];
