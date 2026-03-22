// ═══════════════════════════════════════════
// BitWet — data.js
// Crag database, regions, explore crags
// ═══════════════════════════════════════════

const DEFAULT_CRAGS = [
  {
    id:'sobrio', name:'Sobrio', region:'Ticino', lat:46.480, lon:8.920, alt:950,
    rock:'Gneiss', orientation:['S','SE','SW'], terrain:'vertical',
    notes:'Steep gneiss in the trees above Faido. Holds are good until they aren\'t. South-facing keeps it warm in shoulder season, but summer turns it into a convection oven. The approach is short enough that you\'ll wonder why you\'re already out of breath.'
  },
  {
    id:'sunnenplattli', name:'Sunneplättli', region:'Schwyz / Gersau', lat:46.994, lon:8.524, alt:650,
    rock:'Limestone', orientation:['S','SW'], terrain:'slab',
    notes:'Lakeside limestone with views that almost justify the grades. South-facing and low altitude — perfect for winter cragging, unbearable from June. The rock is polished where everyone grabs, pristine where nobody dares. Parking is an optimistic word for what happens on weekends.'
  },
  {
    id:'handegg', name:'Handegg', region:'Berner Oberland / Grimsel', lat:46.717, lon:8.305, alt:1400,
    rock:'Granite', orientation:['S','SW'], terrain:'slab',
    notes:'Grimsel granite at altitude. Crystal-studded slabs that demand precision and punish laziness. The season is short and the weather changes its mind hourly. When conditions align, there\'s nothing quite like it. When they don\'t, there\'s always the hotel bar.'
  },
  {
    id:'schollenen', name:'Schöllenen', region:'Uri / Göschenen', lat:46.665, lon:8.588, alt:1000,
    rock:'Granite', orientation:['S','SE'], terrain:'vertical',
    notes:'Gorge granite with a dramatic setting and an equally dramatic walk-in. The routes are steep, the rock is good, and the spray from the Reuss keeps things interesting. Historically significant — the Devil built a bridge here, presumably after failing the crux.'
  },
  {
    id:'lehn', name:'Lehn', region:'Berner Oberland / Interlaken', lat:46.688, lon:7.848, alt:800,
    rock:'Limestone', orientation:['S','SW'], terrain:'slab',
    notes:'Roadside limestone near Interlaken that\'s better than it has any right to be. Compact tufas and crimps on a south-facing wall that dries fast after rain. Popular enough that you\'ll share it with half of Bern on good days. The other half is at Gastlosen.'
  },
  {
    id:'salvan', name:'Salvan', region:'Wallis / Bas-Valais', lat:46.120, lon:7.020, alt:900,
    rock:'Gneiss', orientation:['S','SE','SW'], terrain:'vertical',
    notes:'Valais gneiss in a quiet corner that the crowds haven\'t found yet — or have and just don\'t talk about it. Multiple aspects mean you can chase sun or shade depending on your ambition. The crag rewards technique over power, which is either good news or terrible news for you.'
  },
  {
    id:'cadarese', name:'Cadarese', region:'Ossola Valley (IT border)', lat:46.280, lon:8.300, alt:700,
    rock:'Granite', orientation:['S','SW'], terrain:'slab',
    notes:'Compact granite with very little tolerance for hesitation. Technical, friction-dependent, and occasionally humbling. North-facing, which keeps it usable when the valley heats up, but also means it takes its time to dry. Conditions matter more here than you\'d like to admit.'
  },
  {
    id:'felliberg', name:'Felliberg', region:'Uri / Amsteg', lat:46.736, lon:8.641, alt:1200,
    rock:'Granite', orientation:['S','SE'], terrain:'vertical',
    notes:'Granite slabs and faces above Amsteg with a peaceful approach through forest. The climbing is subtle — small edges, delicate footwork, and the kind of moves that look easy until you\'re on them. Early season can be damp; late season can be dark by 4pm. Plan accordingly.'
  },
  {
    id:'drihorlini', name:'Dri Horlini', region:'Wallis / Saastal', lat:46.105, lon:7.945, alt:2100,
    rock:'Gneiss', orientation:['S','SW'], terrain:'slab',
    notes:'High-altitude gneiss in the Saas valley — the kind of place where you earn your sends with a 45-minute hike and thin air. The rock is immaculate, the views are absurd, and the season is approximately six weeks long. Bring sunscreen and low expectations for onsighting.'
  },
  {
    id:'gotthard', name:'Gotthard Tremola', region:'Ticino / Airolo', lat:46.555, lon:8.565, alt:1800,
    rock:'Granite', orientation:['S','SE'], terrain:'vertical',
    notes:'Pass-side granite along the old Tremola road. The cobblestones below are a UNESCO site; the climbing above is less documented but equally demanding. Short season, real weather, and the kind of alpine ambiance that makes you feel like a proper mountaineer. Even on a sport route.'
  },
  {
    id:'vals', name:'Vals', region:'Graubünden', lat:46.617, lon:9.180, alt:1250,
    rock:'Gneiss', orientation:['S','SW'], terrain:'slab',
    notes:'Gneiss in Zumthor country — clean lines, honest holds, no nonsense. The village has thermal baths for when your skin gives out. South-facing and reasonably sheltered, so it collects sun like a savings account. If you can handle the drive, it\'s worth every hairpin.'
  },
  {
    id:'chironico', name:'Chironico Sport', region:'Ticino / V. Levantina', lat:46.445, lon:8.855, alt:750,
    rock:'Gneiss', orientation:['S','SE'], terrain:'vertical',
    notes:'Not bouldering. Sport routes, 6a–7c, on compact gneiss that tends to stay reliable even after weather. The exposure is predominantly south-facing, with natural shelter from wind and lingering moisture. It comes into its own in the colder months. October through April is the window.'
  },
];

const REGIONS = [
  'Ticino', 'Wallis/Valais', 'Berner Oberland', 'Zentralschweiz',
  'Jura', 'Ostschweiz/Graubünden', 'Gotthard/Uri', 'Voralpen'
];

const REGION_CRAGS = {
  'Ticino': [
    { name:'Cresciano Boulder', lat:46.432, lon:8.940, alt:400, rock:'Gneiss', orientation:['S','SW'] },
    { name:'Chironico Boulder', lat:46.445, lon:8.855, alt:750, rock:'Gneiss', orientation:['S','SE'] },
    { name:'Brione', lat:46.375, lon:8.805, alt:350, rock:'Gneiss', orientation:['S'] },
    { name:'Ponte Brolla', lat:46.190, lon:8.745, alt:280, rock:'Gneiss', orientation:['S','SW'] },
    { name:'Lodrino', lat:46.300, lon:8.970, alt:310, rock:'Gneiss', orientation:['SE'] },
    { name:'Lavorgo', lat:46.455, lon:8.835, alt:630, rock:'Gneiss', orientation:['S'] },
    { name:'Osogna', lat:46.320, lon:8.990, alt:280, rock:'Gneiss', orientation:['SW'] },
    { name:'Arcegno', lat:46.175, lon:8.730, alt:330, rock:'Gneiss', orientation:['S','SE'] },
    { name:'Personico', lat:46.363, lon:8.932, alt:330, rock:'Gneiss', orientation:['S'] },
    { name:'Claro', lat:46.330, lon:9.020, alt:350, rock:'Gneiss', orientation:['S','SW'] },
  ],
  'Wallis/Valais': [
    { name:'Saillon', lat:46.170, lon:7.190, alt:480, rock:'Gneiss', orientation:['S'] },
    { name:'Nax', lat:46.220, lon:7.430, alt:1300, rock:'Gneiss', orientation:['S','SE'] },
    { name:'Evolène', lat:46.115, lon:7.495, alt:1400, rock:'Gneiss', orientation:['S','SW'] },
    { name:'Raron', lat:46.310, lon:7.810, alt:680, rock:'Limestone', orientation:['S'] },
    { name:'Brig (Schallberg)', lat:46.310, lon:8.020, alt:1350, rock:'Gneiss', orientation:['S','SE'] },
    { name:'Vercorin', lat:46.260, lon:7.530, alt:1340, rock:'Gneiss', orientation:['S'] },
    { name:'Zermatt (Furi)', lat:46.005, lon:7.745, alt:1850, rock:'Gneiss', orientation:['SE'] },
    { name:'Dorénaz', lat:46.140, lon:7.045, alt:500, rock:'Limestone', orientation:['S','SW'] },
    { name:'Martigny (La Bâtiaz)', lat:46.105, lon:7.075, alt:510, rock:'Limestone', orientation:['SW'] },
    { name:'Stalden', lat:46.230, lon:7.870, alt:800, rock:'Gneiss', orientation:['S','SE'] },
  ],
  'Berner Oberland': [
    { name:'Gimmelwald', lat:46.548, lon:7.895, alt:1380, rock:'Limestone', orientation:['S','SW'] },
    { name:'Oeschinensee', lat:46.505, lon:7.725, alt:1600, rock:'Limestone', orientation:['S'] },
    { name:'Gastlosen', lat:46.605, lon:7.242, alt:1800, rock:'Limestone', orientation:['S','SW'] },
    { name:'Kandersteg', lat:46.490, lon:7.675, alt:1200, rock:'Limestone', orientation:['S','SE'] },
    { name:'Innertkirchen', lat:46.710, lon:8.220, alt:640, rock:'Granite', orientation:['S'] },
    { name:'Bätterich', lat:46.683, lon:7.850, alt:850, rock:'Limestone', orientation:['S','SW'] },
    { name:'Rinderhorn', lat:46.405, lon:7.700, alt:2100, rock:'Limestone', orientation:['SE'] },
    { name:'Guttannen', lat:46.660, lon:8.280, alt:1100, rock:'Granite', orientation:['S','SE'] },
    { name:'Erstfeld (Resti)', lat:46.830, lon:8.650, alt:600, rock:'Granite', orientation:['S'] },
    { name:'Meiringen', lat:46.725, lon:8.185, alt:600, rock:'Limestone', orientation:['S','SW'] },
  ],
  'Zentralschweiz': [
    { name:'Engelberg', lat:46.820, lon:8.410, alt:1050, rock:'Limestone', orientation:['S'] },
    { name:'Gersau', lat:46.994, lon:8.524, alt:500, rock:'Limestone', orientation:['S','SW'] },
    { name:'Melchsee-Frutt', lat:46.775, lon:8.270, alt:1920, rock:'Limestone', orientation:['S'] },
    { name:'Brunnen', lat:46.995, lon:8.610, alt:440, rock:'Limestone', orientation:['S','SE'] },
    { name:'Stoos', lat:46.980, lon:8.665, alt:1300, rock:'Limestone', orientation:['SW'] },
    { name:'Pilatus', lat:46.960, lon:8.260, alt:1800, rock:'Limestone', orientation:['S'] },
    { name:'Rigi', lat:47.050, lon:8.480, alt:1000, rock:'Limestone', orientation:['S','SW'] },
    { name:'Sisikon', lat:46.955, lon:8.650, alt:500, rock:'Limestone', orientation:['S'] },
    { name:'Beckenried', lat:46.965, lon:8.475, alt:440, rock:'Limestone', orientation:['S','SE'] },
    { name:'Schwyz', lat:47.020, lon:8.650, alt:600, rock:'Limestone', orientation:['S','SW'] },
  ],
  'Jura': [
    { name:'Biel / Frinvillier', lat:47.170, lon:7.230, alt:500, rock:'Limestone', orientation:['S','SW'] },
    { name:'Moutier', lat:47.280, lon:7.370, alt:550, rock:'Limestone', orientation:['S'] },
    { name:'Delémont', lat:47.365, lon:7.345, alt:430, rock:'Limestone', orientation:['SE'] },
    { name:'Péry', lat:47.190, lon:7.250, alt:580, rock:'Limestone', orientation:['S'] },
    { name:'Roches (Gorges Court)', lat:47.282, lon:7.360, alt:520, rock:'Limestone', orientation:['S','SW'] },
    { name:'Crémines', lat:47.295, lon:7.395, alt:600, rock:'Limestone', orientation:['S'] },
    { name:'Balsthal', lat:47.320, lon:7.690, alt:500, rock:'Limestone', orientation:['S','SE'] },
    { name:'Gänsbrunnen', lat:47.280, lon:7.430, alt:750, rock:'Limestone', orientation:['SW'] },
    { name:'Liesberg', lat:47.400, lon:7.430, alt:460, rock:'Limestone', orientation:['S'] },
    { name:'Vermes', lat:47.330, lon:7.325, alt:680, rock:'Limestone', orientation:['S','SW'] },
  ],
  'Ostschweiz/Graubünden': [
    { name:'Chur (Haldenstein)', lat:46.880, lon:9.520, alt:600, rock:'Limestone', orientation:['S'] },
    { name:'Flims', lat:46.835, lon:9.280, alt:1100, rock:'Limestone', orientation:['S','SW'] },
    { name:'Avers', lat:46.470, lon:9.555, alt:2000, rock:'Gneiss', orientation:['S'] },
    { name:'Bergün', lat:46.630, lon:9.745, alt:1380, rock:'Granite', orientation:['S','SE'] },
    { name:'Zillis', lat:46.630, lon:9.440, alt:950, rock:'Gneiss', orientation:['S'] },
    { name:'San Bernardino', lat:46.460, lon:9.170, alt:1600, rock:'Gneiss', orientation:['S','SW'] },
    { name:'Mesocco', lat:46.395, lon:9.225, alt:780, rock:'Gneiss', orientation:['SE'] },
    { name:'Poschiavo', lat:46.325, lon:10.060, alt:1000, rock:'Granite', orientation:['S'] },
    { name:'Davos', lat:46.800, lon:9.830, alt:1560, rock:'Gneiss', orientation:['S','SW'] },
    { name:'Splügen', lat:46.545, lon:9.320, alt:1460, rock:'Gneiss', orientation:['S'] },
  ],
  'Gotthard/Uri': [
    { name:'Göschenen', lat:46.665, lon:8.590, alt:1100, rock:'Granite', orientation:['S','SE'] },
    { name:'Andermatt', lat:46.635, lon:8.595, alt:1440, rock:'Granite', orientation:['S'] },
    { name:'Wassen', lat:46.710, lon:8.600, alt:930, rock:'Granite', orientation:['S','SW'] },
    { name:'Realp', lat:46.600, lon:8.505, alt:1550, rock:'Granite', orientation:['S'] },
    { name:'Hospental', lat:46.620, lon:8.570, alt:1500, rock:'Granite', orientation:['SE'] },
    { name:'Silenen', lat:46.790, lon:8.680, alt:500, rock:'Granite', orientation:['S','SE'] },
    { name:'Gurtnellen', lat:46.740, lon:8.625, alt:750, rock:'Granite', orientation:['S'] },
    { name:'Airolo', lat:46.530, lon:8.610, alt:1200, rock:'Granite', orientation:['S','SW'] },
    { name:'Attinghausen', lat:46.860, lon:8.620, alt:470, rock:'Granite', orientation:['S'] },
    { name:'Bürglen', lat:46.875, lon:8.680, alt:550, rock:'Limestone', orientation:['S','SE'] },
  ],
  'Voralpen': [
    { name:'Gantrisch', lat:46.725, lon:7.440, alt:1550, rock:'Limestone', orientation:['S'] },
    { name:'Stockhorn', lat:46.695, lon:7.540, alt:1600, rock:'Limestone', orientation:['S','SW'] },
    { name:'Justistal', lat:46.705, lon:7.720, alt:1000, rock:'Limestone', orientation:['S'] },
    { name:'Niederhorn', lat:46.730, lon:7.770, alt:1500, rock:'Limestone', orientation:['S','SE'] },
    { name:'Sigriswil', lat:46.715, lon:7.720, alt:800, rock:'Limestone', orientation:['S','SW'] },
    { name:'Niesen', lat:46.645, lon:7.650, alt:1400, rock:'Limestone', orientation:['S'] },
    { name:'Eriz', lat:46.770, lon:7.800, alt:1100, rock:'Limestone', orientation:['S','SE'] },
    { name:'Saxeten', lat:46.650, lon:7.835, alt:1000, rock:'Limestone', orientation:['S'] },
    { name:'Habkern', lat:46.740, lon:7.870, alt:950, rock:'Limestone', orientation:['S','SW'] },
    { name:'Gurnigel', lat:46.730, lon:7.460, alt:1500, rock:'Limestone', orientation:['SW'] },
  ],
};
