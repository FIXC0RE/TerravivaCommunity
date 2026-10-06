export const TILE = 24;
export const CHUNK = 16;

export type Biome =
  | "bosque"
  | "pradera"
  | "montana"
  | "agua"
  | "playa"
  | "tropical"
  | "pantano"
  | "seco"
  | "frio"
  | "denso"
  | "contaminado";

export type WorldObject = {
  id: string;
  type: "tree" | "plant" | "trash" | "animal" | "oil";
  x: number;
  y: number;
  variant: number;
  species?: string;
};

export type ChunkData = {
  x: number;
  y: number;
  objects: WorldObject[];
};

export const biomeInfo: Record<Biome, { label: string; ground: string; accent: string }> = {
  bosque: { label: "Bosque", ground: "#4e9b50", accent: "#226b3a" },
  pradera: { label: "Pradera", ground: "#79bd55", accent: "#c8df68" },
  montana: { label: "Montaña", ground: "#77827a", accent: "#aab39f" },
  agua: { label: "Río y lago", ground: "#398fc2", accent: "#65b9d0" },
  playa: { label: "Costa", ground: "#d8bd69", accent: "#f0d88a" },
  tropical: { label: "Trópico", ground: "#3fa95b", accent: "#227449" },
  pantano: { label: "Pantano", ground: "#587c51", accent: "#87a75b" },
  seco: { label: "Zona seca", ground: "#c58e4b", accent: "#e1bc62" },
  frio: { label: "Zona fría", ground: "#c5d9d2", accent: "#ecf5e9" },
  denso: { label: "Bosque denso", ground: "#347044", accent: "#174d32" },
  contaminado: { label: "Zona contaminada", ground: "#686b4d", accent: "#969751" },
};

export const speciesByBiome: Record<Biome, string[]> = {
  bosque: ["Zorro rojo", "Ardilla", "Petirrojo"],
  pradera: ["Conejo", "Abeja silvestre", "Mariposa"],
  montana: ["Cabra montés", "Águila"],
  agua: ["Nutria", "Pato", "Libélula"],
  playa: ["Cangrejo", "Gaviota"],
  tropical: ["Tucán", "Mono aullador", "Mariposa azul"],
  pantano: ["Rana verde", "Garza"],
  seco: ["Lagartija", "Correcaminos"],
  frio: ["Liebre ártica", "Búho nival"],
  denso: ["Ciervo", "Tejón", "Búho"],
  contaminado: ["Cuervo"],
};

function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x: number, y: number, seed: number, scale: number) {
  const sx = x / scale;
  const sy = y / scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = sx - ix;
  const fy = sy - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

export function getBiome(tx: number, ty: number, seed: number): Biome {
  const elevation = smoothNoise(tx, ty, seed, 38) * 0.7 + smoothNoise(tx, ty, seed + 7, 13) * 0.3;
  const moisture = smoothNoise(tx, ty, seed + 31, 44);
  const temperature = smoothNoise(tx, ty, seed + 89, 58) - Math.min(0.18, Math.abs(ty) / 10000);
  const pollution = smoothNoise(tx, ty, seed + 151, 30);
  const river = Math.abs(smoothNoise(tx, ty, seed + 211, 52) - 0.5);

  if (pollution > 0.82) return "contaminado";
  if (river < 0.034 || (elevation < 0.27 && moisture > 0.48)) return "agua";
  if (river < 0.062) return "playa";
  if (elevation > 0.77) return temperature < 0.47 ? "frio" : "montana";
  if (temperature < 0.25) return "frio";
  if (moisture < 0.23) return "seco";
  if (moisture > 0.78 && elevation < 0.5) return "pantano";
  if (temperature > 0.67 && moisture > 0.58) return "tropical";
  if (moisture > 0.68) return "denso";
  if (moisture > 0.49) return "bosque";
  return "pradera";
}

export function chunkKey(cx: number, cy: number) {
  return `${cx},${cy}`;
}

export function generateChunk(cx: number, cy: number, seed: number, health: number): ChunkData {
  const objects: WorldObject[] = [];
  const startX = cx * CHUNK;
  const startY = cy * CHUNK;

  for (let ly = 0; ly < CHUNK; ly += 1) {
    for (let lx = 0; lx < CHUNK; lx += 1) {
      const tx = startX + lx;
      const ty = startY + ly;
      const biome = getBiome(tx, ty, seed);
      const roll = hash(tx, ty, seed + 501);
      const x = (tx + 0.5) * TILE;
      const y = (ty + 0.5) * TILE;
      const id = `${tx}:${ty}`;
      const variant = Math.floor(hash(tx, ty, seed + 701) * 4);

      if (biome === "agua" || biome === "playa") {
        if (roll < (biome === "agua" ? 0.012 : 0.018)) {
          objects.push({ id: `${id}:trash`, type: "trash", x, y, variant });
        }
        continue;
      }
      const treeChance =
        biome === "denso" ? 0.2 : biome === "bosque" || biome === "tropical" ? 0.12 : biome === "pantano" ? 0.07 : 0.025;
      if (roll < treeChance) {
        objects.push({ id: `${id}:tree`, type: "tree", x, y, variant });
      } else if (roll < treeChance + 0.045) {
        objects.push({ id: `${id}:plant`, type: "plant", x, y, variant });
      } else if (roll > 0.975 || (biome === "contaminado" && roll > 0.87)) {
        objects.push({ id: `${id}:trash`, type: roll > 0.993 ? "oil" : "trash", x, y, variant });
      } else if (roll > 0.945 && health > 42 && biome !== "contaminado") {
        const list = speciesByBiome[biome];
        objects.push({
          id: `${id}:animal`,
          type: "animal",
          x,
          y,
          variant,
          species: list[Math.floor(hash(tx, ty, seed + 909) * list.length)],
        });
      }
    }
  }
  return { x: cx, y: cy, objects };
}

export function tileVariation(tx: number, ty: number, seed: number) {
  return hash(tx, ty, seed + 1201);
}
