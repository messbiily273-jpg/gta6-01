// SOLMARA HEAT — every tuning number and colour in one place.
// The city is a fixed grid; no rule below depends on the screen size.
export const STEP = 1 / 60;

export const CITY = {
  blocks: 7, // blocks per side
  blockSize: 56, // metres of buildable block
  street: 16, // metres of street between blocks
  get pitch() { return this.blockSize + this.street; },
  get half() { return (this.blocks * this.pitch + this.street) / 2; },
  beachWidth: 60, // sand strip on the south edge, then the sea
  seaWidth: 220,
};

export const PLAYER = {
  radius: 0.55,
  walkSpeed: 6.5,
  sprintSpeed: 10.5,
  accel: 42,
  jumpSpeed: 8.5,
  gravity: 24,
  maxHealth: 100,
  punchDamage: 12,
};

export const CAR = {
  accel: 22,
  brake: 38,
  reverseAccel: 12,
  maxSpeed: 42, // ~150 km/h
  maxReverse: 12,
  turnRate: 1.9,
  grip: 6,
  radius: 1.6,
};

export const WANTED = {
  maxStars: 5,
  decayDelay: 18, // seconds with no crime before stars start falling
  decayInterval: 7, // seconds per star lost while hidden
  stealHeat: 1,
  hitPedHeat: 1,
  killHeat: 2,
  shootHeat: 1,
};

export const SAVE_KEY = 'solmara-heat.save.v1';

export const PALETTE = {
  sky: 0x8ec9ee,
  horizon: 0xffd9a0,
  sun: 0xfff2cf,
  sea: 0x1e7fa8,
  sand: 0xe8cf9a,
  asphalt: 0x2e2f36,
  asphaltLine: 0xd8d3a8,
  sidewalk: 0x9a938a,
  grass: 0x5da24a,
  building: [0xd8b48f, 0xc9a0a0, 0xa8b8c8, 0xe0cfa0, 0xb8a888, 0x98a8b8, 0xd0a878],
  glass: 0x2a4a66,
  playerJacket: 0xff5a3c,
  playerSkin: 0xc98d64,
  copBlue: 0x1e4fd8,
  copDark: 0x14181f,
  policeCar: 0xe8e8e8,
  taxi: 0xffc21c,
};

export const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
