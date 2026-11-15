// Stage layout: everything is in world pixels on a 1280x720 view.
const GROUND_Y = 600;
const LEVEL_W = 8700;
const ARENA_X = 7420;          // camera locks here for the boss fight
const FORT_X = 3700;           // jungle gives way to the fortress

const Level = {
  // solid floor segments (anything not covered is a pit)
  ground: [
    { x: 0,    w: 1400, type: 'ground' },
    { x: 1650, w: 1050, type: 'ground' },
    { x: 3100, w: 600,  type: 'ground' },
    { x: 3700, w: 1300, type: 'steel' },
    { x: 5300, w: 1200, type: 'steel' },
    { x: 6760, w: 1940, type: 'steel' },
  ],
  // one-way platforms
  platforms: [
    { x: 300,  y: 470, w: 256, type: 'wood' }, { x: 650,  y: 350, w: 256, type: 'wood' },
    { x: 1000, y: 470, w: 256, type: 'wood' }, { x: 1440, y: 500, w: 170, type: 'wood' },
    { x: 1800, y: 470, w: 256, type: 'wood' }, { x: 2100, y: 350, w: 256, type: 'wood' },
    { x: 2400, y: 470, w: 192, type: 'wood' }, { x: 2740, y: 520, w: 128, type: 'wood' },
    { x: 2920, y: 460, w: 128, type: 'wood' }, { x: 3250, y: 470, w: 256, type: 'wood' },
    { x: 3900, y: 470, w: 256, type: 'steel' }, { x: 4250, y: 350, w: 256, type: 'steel' },
    { x: 4600, y: 470, w: 256, type: 'steel' }, { x: 5040, y: 510, w: 128, type: 'steel' },
    { x: 5180, y: 440, w: 100, type: 'steel' }, { x: 5500, y: 470, w: 256, type: 'steel' },
    { x: 5850, y: 350, w: 256, type: 'steel' }, { x: 6150, y: 470, w: 256, type: 'steel' },
    { x: 6550, y: 500, w: 170, type: 'steel' }, { x: 6900, y: 470, w: 256, type: 'steel' },
    { x: 7540, y: 450, w: 230, type: 'steel' }, { x: 7850, y: 330, w: 230, type: 'steel' },
  ],
  checkpoints: [1720, 3760, 5360, 6820, 7470],
  // enemies that exist from the start (activated when they scroll into view)
  enemies: [
    { t: 'turret', x: 1150 }, { t: 'heavy', x: 1950 }, { t: 'turret', x: 2228, y: 350 }, { t: 'turret', x: 2560 },
    { t: 'heavy', x: 3420 }, { t: 'turret', x: 4050 }, { t: 'turret', x: 4378, y: 350 }, { t: 'heavy', x: 4500 },
    { t: 'turret', x: 4860 }, { t: 'heavy', x: 5480 }, { t: 'turret', x: 5760 }, { t: 'turret', x: 5978, y: 350 },
    { t: 'heavy', x: 6100 }, { t: 'turret', x: 6380 }, { t: 'heavy', x: 6980 }, { t: 'turret', x: 7200 },
  ],
  // things that fire once when the camera passes x
  triggers: [
    { x: 250,  carrier: 'S' }, { x: 700,  drones: 2 }, { x: 1700, carrier: 'H' }, { x: 2200, drones: 2 },
    { x: 2900, carrier: 'L' }, { x: 3600, drones: 3 }, { x: 4200, carrier: 'R' }, { x: 4700, drones: 3 },
    { x: 5400, carrier: 'H' }, { x: 5900, drones: 3 }, { x: 6500, carrier: 'S' }, { x: 6900, drones: 2 },
  ],
};
