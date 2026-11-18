// buildCity — Solmara Bay, a sun-soaked coastal city of our own invention.
// A 7x7 block grid on the shore: streets, towers, a park, a marina bar, a
// warehouse district, a pier and a beach. Everything is generated from the
// seeded rng, so the same seed builds the same city every time.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { range, pick, pickIndex } from './random.js';

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A building facade: base colour, lit windows, a darker ground floor. */
function buildingTexture(rng, base, floors, cols) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, h - 18, w, 18);
    const cellW = w / cols;
    const cellH = (h - 24) / floors;
    for (let f = 0; f < floors; f += 1) {
      for (let c = 0; c < cols; c += 1) {
        const lit = rng() < 0.35;
        ctx.fillStyle = lit ? '#ffe9a8' : '#2a4a66';
        ctx.fillRect(4 + c * cellW, 6 + f * cellH, cellW - 8, cellH - 8);
      }
    }
  });
}

/** Asphalt with a dashed centre line, tiled along a road. */
function roadTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2e2f36';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d8d3a8';
    ctx.fillRect(w / 2 - 2, 8, 4, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(6, 0, 3, h);
    ctx.fillRect(w - 9, 0, 3, h);
  });
}

function box(w, h, d, color, x, y, z, material) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    material || new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildCity(scene, rng) {
  const city = {
    colliders: [], // {minX, maxX, minZ, maxZ}
    roadsX: [], // road centre x coordinates (north-south roads)
    roadsZ: [], // road centre z coordinates (east-west roads)
    intersections: [],
    parkingSpots: [], // {x, z, yaw}
    landmarks: {},
    palms: [],
    lamps: [],
  };
  const half = CITY.half;
  const pitch = CITY.pitch;
  const street = CITY.street;

  // --- ground: city slab, sand strip, sea ---
  const groundMat = new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 40, half * 2 + CITY.beachWidth + CITY.seaWidth + 40), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, (CITY.beachWidth + CITY.seaWidth) / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 40, CITY.beachWidth),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, half + CITY.beachWidth / 2);
  sand.receiveShadow = true;
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 600, CITY.seaWidth),
    new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.25, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.05, half + CITY.beachWidth + CITY.seaWidth / 2);
  scene.add(sea);

  // --- roads ---
  for (let k = 0; k <= CITY.blocks; k += 1) {
    city.roadsX.push(-half + street / 2 + k * pitch);
    city.roadsZ.push(-half + street / 2 + k * pitch);
  }
  const roadTex = roadTexture();
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  for (const rx of city.roadsX) {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(street, half * 2),
      new THREE.MeshStandardMaterial({ map: roadTex.clone(), roughness: 1 }),
    );
    road.material.map.repeat.set(1, Math.floor(half * 2 / 16));
    road.material.map.needsUpdate = true;
    road.rotation.x = -Math.PI / 2;
    road.position.set(rx, 0.03, 0);
    road.receiveShadow = true;
    scene.add(road);
  }
  for (const rz of city.roadsZ) {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2, street),
      new THREE.MeshStandardMaterial({ map: roadTex.clone(), roughness: 1 }),
    );
    road.material.map.repeat.set(Math.floor(half * 2 / 16), 1);
    road.material.map.needsUpdate = true;
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.03, rz);
    road.receiveShadow = true;
    scene.add(road);
  }
  for (const rx of city.roadsX) {
    for (const rz of city.roadsZ) city.intersections.push({ x: rx, z: rz });
  }

  // --- blocks: sidewalks, buildings, park, landmarks ---
  const baseColors = PALETTE.building.map((c) => '#' + c.toString(16).padStart(6, '0'));
  const hotelTex = buildingTexture(rng, '#e0cfa0', 22, 8);
  const hallTex = buildingTexture(rng, '#c9a0a0', 6, 10);

  function addCollider(x, z, w, d) {
    city.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  function addBuilding(bx, bz, w, d, h, tex) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 }),
    );
    mesh.position.set(bx, h / 2, bz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // rooftop box
    const roof = box(Math.min(w, d) * 0.3, 2.2, Math.min(w, d) * 0.3, 0x55565e, bx + w * 0.15, h + 1.1, bz - d * 0.12);
    scene.add(roof);
    addCollider(bx, bz, w, d);
    return mesh;
  }

  function addPalm(x, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.35, 5.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 }),
    );
    trunk.position.y = 2.75;
    trunk.castShadow = true;
    group.add(trunk);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f8f4e, roughness: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i += 1) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.9), frondMat);
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.4, 5.7, Math.sin(a) * 1.4);
      frond.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
      frond.rotation.y = -a + Math.PI / 2;
      frond.rotation.x = -0.45;
      group.add(frond);
    }
    group.position.set(x, 0, z);
    scene.add(group);
    city.palms.push(group);
  }

  function addLamp(x, z) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x30323a, roughness: 0.6, metalness: 0.4 }),
    );
    pole.position.y = 3;
    pole.castShadow = true;
    group.add(pole);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffdf8a, emissiveIntensity: 0.7 }),
    );
    bulb.position.y = 6.1;
    group.add(bulb);
    group.position.set(x, 0, z);
    scene.add(group);
    city.lamps.push(group);
  }

  const landmarkBlocks = {
    '3,3': 'park',
    '1,5': 'bar',
    '5,1': 'warehouse',
    '4,4': 'hotel',
    '0,0': 'hideout',
    '6,6': 'pier',
  };

  for (let i = 0; i < CITY.blocks; i += 1) {
    for (let j = 0; j < CITY.blocks; j += 1) {
      const bx0 = city.roadsX[i] + street / 2;
      const bz0 = city.roadsZ[j] + street / 2;
      const cx = bx0 + CITY.blockSize / 2;
      const cz = bz0 + CITY.blockSize / 2;
      // sidewalk slab
      const slab = box(CITY.blockSize + 2, 0.18, CITY.blockSize + 2, PALETTE.sidewalk, cx, 0.09, cz);
      slab.castShadow = false;
      scene.add(slab);
      const kind = landmarkBlocks[i + ',' + j];

      if (kind === 'park') {
        const lawn = new THREE.Mesh(
          new THREE.PlaneGeometry(CITY.blockSize, CITY.blockSize),
          new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 1 }),
        );
        lawn.rotation.x = -Math.PI / 2;
        lawn.position.set(cx, 0.2, cz);
        lawn.receiveShadow = true;
        scene.add(lawn);
        const fountain = new THREE.Mesh(
          new THREE.CylinderGeometry(7, 8, 1.2, 20),
          new THREE.MeshStandardMaterial({ color: 0x9aa4ac, roughness: 0.4 }),
        );
        fountain.position.set(cx, 0.8, cz);
        fountain.castShadow = true;
        scene.add(fountain);
        const water = new THREE.Mesh(
          new THREE.CylinderGeometry(6, 6, 0.4, 20),
          new THREE.MeshStandardMaterial({ color: 0x3fa8d8, roughness: 0.15 }),
        );
        water.position.set(cx, 1.3, cz);
        scene.add(water);
        addCollider(cx, cz, 16, 16);
        for (let p = 0; p < 6; p += 1) addPalm(cx + range(rng, -22, 22), cz + range(rng, -22, 22));
        city.landmarks.plaza = { x: cx, z: cz, label: 'Solmara Plaza' };
        continue;
      }
      if (kind === 'hotel') {
        addBuilding(cx, cz, 40, 40, 78, hotelTex);
        city.landmarks.hotel = { x: cx, z: cz + 24, label: 'Grand Solmara Hotel' };
        addPalm(cx - 24, cz + 24);
        addPalm(cx + 24, cz + 24);
        continue;
      }
      if (kind === 'bar') {
        addBuilding(cx - 8, cz, 26, 20, 9, buildingTexture(rng, '#7a4a3a', 2, 6));
        const sign = box(16, 2.4, 0.6, 0xff5a3c, cx - 8, 9.5, cz + 10.5);
        scene.add(sign);
        city.landmarks.bar = { x: cx - 8, z: cz + 14, label: 'The Rusty Anchor' };
        addPalm(cx + 20, cz - 18);
        continue;
      }
      if (kind === 'warehouse') {
        addBuilding(cx, cz - 6, 44, 26, 12, buildingTexture(rng, '#6a7078', 2, 12));
        addBuilding(cx - 14, cz + 16, 16, 14, 8, buildingTexture(rng, '#707a6a', 1, 6));
        city.landmarks.warehouse = { x: cx, z: cz + 20, label: 'Harbor Warehouse' };
        continue;
      }
      if (kind === 'hideout') {
        addBuilding(cx - 10, cz - 6, 22, 18, 10, buildingTexture(rng, '#4a5a6a', 2, 5));
        city.landmarks.hideout = { x: cx + 14, z: cz + 14, label: 'Hideout Garage' };
        addPalm(cx + 20, cz - 20);
        continue;
      }
      if (kind === 'pier') {
        // the south-east block becomes a boardwalk strip; the pier itself is on the beach
        addBuilding(cx - 12, cz, 24, 22, 14, buildingTexture(rng, pick(rng, baseColors), 3, 6));
        city.landmarks.boardwalk = { x: cx + 16, z: cz, label: 'Boardwalk' };
        continue;
      }

      // ordinary block: 1-3 buildings with a yard
      const count = 1 + pickIndex(rng, 3);
      for (let b = 0; b < count; b += 1) {
        const w = range(rng, 14, 26);
        const d = range(rng, 14, 26);
        const h = range(rng, 9, 42);
        const floors = Math.max(2, Math.round(h / 3.4));
        const cols = Math.max(3, Math.round(w / 4));
        const ox = range(rng, -14, 14);
        const oz = range(rng, -14, 14);
        const tex = buildingTexture(rng, pick(rng, baseColors), floors, cols);
        addBuilding(cx + ox, cz + oz, w, d, h, tex);
      }
      if (rng() < 0.6) addPalm(cx + range(rng, -20, 20), cz + range(rng, -20, 20));
    }
  }

  // --- pier: wooden deck out over the sea ---
  const pierX = city.roadsX[6];
  const pier = new THREE.Group();
  const deck = box(10, 0.8, 70, 0x8a6a48, 0, 0.4, 0);
  pier.add(deck);
  for (let k = 0; k < 8; k += 1) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 1 }),
    );
    post.position.set(k % 2 === 0 ? -4.4 : 4.4, -0.4, -30 + k * 8.5);
    pier.add(post);
  }
  pier.position.set(pierX, 0, half + CITY.beachWidth + 30);
  scene.add(pier);
  city.landmarks.pier = { x: pierX, z: half + CITY.beachWidth + 8, label: 'Pier 9' };
  addCollider(pierX, half + CITY.beachWidth + 30, 10, 70);

  // --- beach umbrellas ---
  for (let k = 0; k < 7; k += 1) {
    const ux = -half + 40 + k * 70 + range(rng, -12, 12);
    const uz = half + CITY.beachWidth / 2 + range(rng, -14, 14);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.8 }),
    );
    pole.position.set(ux, 1.3, uz);
    scene.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: pick(rng, [0xff5a3c, 0xffc21c, 0x3fa8d8, 0xff7ad8]), roughness: 0.9 }),
    );
    top.position.set(ux, 3, uz);
    top.castShadow = true;
    scene.add(top);
  }

  // --- street lamps along every other intersection corner ---
  for (let k = 0; k < city.intersections.length; k += 1) {
    if (k % 2 !== 0) continue;
    const n = city.intersections[k];
    addLamp(n.x + street / 2 + 1.5, n.z + street / 2 + 1.5);
  }

  // --- parking spots along road edges (for parked cars to steal) ---
  for (const rx of city.roadsX) {
    for (const rz of city.roadsZ) {
      if (rng() < 0.45) {
        city.parkingSpots.push({ x: rx + street / 2 - 2.4, z: rz + range(rng, 12, 40), yaw: Math.PI / 2 });
      }
      if (rng() < 0.45) {
        city.parkingSpots.push({ x: rx - street / 2 + 2.4, z: rz + range(rng, 12, 40), yaw: -Math.PI / 2 });
      }
    }
  }

  city.spawn = { x: city.landmarks.hideout.x, z: city.landmarks.hideout.z + 8, yaw: Math.PI };
  return city;
}

/** Push a circle (x, z, radius) out of every building collider it overlaps. */
export function resolveCollisions(city, x, z, radius) {
  let nx = x;
  let nz = z;
  for (const c of city.colliders) {
    const cx = Math.max(c.minX, Math.min(nx, c.maxX));
    const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
    const dx = nx - cx;
    const dz = nz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * radius;
        nz = cz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration
        const pushL = nx - c.minX + radius;
        const pushR = c.maxX - nx + radius;
        const pushT = nz - c.minZ + radius;
        const pushB = c.maxZ - nz + radius;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) nx = c.minX - radius;
        else if (m === pushR) nx = c.maxX + radius;
        else if (m === pushT) nz = c.minZ - radius;
        else nz = c.maxZ + radius;
      }
    }
  }
  return { x: nx, z: nz };
}

/** Clamp a position to the playable area (city + beach, not the sea). */
export function clampToCity(x, z) {
  const half = CITY.half + CITY.beachWidth - 4;
  return {
    x: Math.max(-CITY.half - 6, Math.min(CITY.half + 6, x)),
    z: Math.max(-CITY.half - 6, Math.min(half, z)),
  };
}

export function pointInCollider(city, x, z) {
  for (const c of city.colliders) {
    if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return true;
  }
  return false;
}
