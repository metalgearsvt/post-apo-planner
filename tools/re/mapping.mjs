// How planner ids (js/data_wiki.js) and terrain ids line up with the game's internal keys.
// Shared by build_catalog.mjs and compare_wiki.mjs.

// Planner building id -> game key. Pseudo keys: `road_<n>_notsaved:river|sea` = that road built as a
// bridge; `forest:<n>` = planted forest type n (Grow Forest action).
export const WIKI_TO_GAME = {
  dirt_road: 'road_1_notsaved', paved_road: 'road_2_notsaved', basic_road: 'road_3_notsaved', street_road: 'road_4_notsaved',
  fast_road: 'road_5_notsaved', eco_road: 'road_6_notsaved',
  // Wiki "bridges" are roads built on river / sea tiles. Tier mapping is by cost (Sea T1 = Street Road on sea).
  river_bridge: 'road_1_notsaved:river', sea_bridge_t1: 'road_4_notsaved:sea', sea_bridge_t2: 'road_5_notsaved:sea', sea_bridge_t3: 'road_6_notsaved:sea',
  gold_mine: 'golden_mine', advanced_gold_mine: 'golden_mine_2', heavy_gold_mine: 'golden_mine_3', dual_gold_mine: 'golden_mine_4',
  special_gold_mine: 'golden_mine_premium', premium_gold_mine: 'golden_mine_premium_2', complex_gold_mine: 'golden_mine_premium_3',
  eco_gold_mine: 'golden_mine_eco', titanium_dual_gold_mine: 'golden_titan_dual', titanium_eco_gold_mine: 'golden_titan_eco',
  titanium_complex_gold_mine: 'golden_titan_complex',
  lumbermill: 'saw_mill', industrialmill: 'heavy_lumber_mill', premiummill: 'premium_lumber_mill', dronemill: 'lumber_mill_drone', lumberpile: 'wood_storage',
  farm: 'farm', bigfarm: 'farm_big', silo: 'silo', biodome: 'bio_dom', superbiodome: 'bio_dom_big',
  coalplant: 'coal_plant', solarpanel: 'solarpanels', goldsolarpanel: 'golden_solar', seagenerator: 'water_generator', triplegenerator: 'water_generator_2',
  windmill: 'windmill', advancedwindmill: 'windmill_12', modernwindmill: 'windmill_2', thermalplant: 'thermal_plant', uraniumpowerplant: 'uranium_plant',
  stone_mine: 'rock_mine', mk2_stone_mine: 'rock_mine2', sea_stone_mine: 'rock_water_mine', stone_conveyor: 'rock_mine_boost', mega_stone_conveyor: 'rock_mine_boost_2',
  hybrid_mine: 'rockyiron', iron_mine: 'iron_mine', mk2_iron_mine: 'premium_iron_mine', foundry: 'foundry', heavy_foundry: 'foundry_big', eco_foundry: 'foundry_eco', steel_storage: 'steel_storage',
  chipfactory: 'chip_factory', heavychipfactory: 'chip_factory_big', spaceagefactory: 'chip_scrap_factory',
  onshoreoilrig: 'oil_rig_ground', offshoreoilrig: 'oil_rig', riftoilrig: 'rift_miner', oilstorage: 'oil_storage', tanker: 'tanker',
  uraniumrefinery: 'uranium_factory_1', ubatterystorage: 'uranium_storage_1',
  gem_mine: 'gem_mine', super_factory: 'super_factory', dual_super_factory: 'super_factory_2',
  storagecontainer: 'storage_container', storagecrane: 'storage_crane', premiumstorage: 'premium_storage', ecostorage: 'eco_storage', riftstorage: 'rift_storage_1',
  small_shipyard: 'shipyard_small', heavy_shipyard: 'shipyard_heavy', shipyard_market: 'shipyard_market', mega_shipyard: 'shipyard_cytrium', shipyard_storage: 'storage_shipyard',
  rivercleaner: 'river_cleaner', microcleaner: 'river_trees', citrhodiumcleaner: 'river_cytrium', massive_air_cleaner: 'mair_cleaner', filterarray: 'filter_array_1',
  scouttower: 'watch_tower', sensortower: 'sensor_tower', radar: 'radar',
  small_forest: 'forest:1', dense_forest: 'forest:2', deep_forest: 'forest:3', thick_forest: 'forest:4', tall_forest: 'forest:5',
  sequoia: 'sekvoja', palmtree: 'palms', mangrove: 'mangrove', bamboo: 'bambus', sakura: 'sakura', winterforest: 'winter_tree', specialforest: 'gem_tree',
  trainstation: 'train_station', rail: 'rails', pavement: 'pavement_notsaved', replicator: 'replicator',
  deepwater_reactor: 'deepwater_reactor', small_suburb: 'primestie_1', rift_uranium_digger: 'rift_mine_uranium', railside_panels: 'rails_solar', utopia_spire: 'light_monument',
};

// Game tile key -> planner terrain id, and the extra terrain types: shared with the app's map import.
export { TILE_TO_TERRAIN, EXTRA_TERRAIN } from '../../js/gamemap.js';
