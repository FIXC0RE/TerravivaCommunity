import { useCallback, useEffect, useRef, useState } from "react";
import {
  biomeInfo,
  CHUNK,
  chunkKey,
  generateChunk,
  getBiome,
  speciesByBiome,
  TILE,
  tileVariation,
  type Biome,
  type ChunkData,
  type WorldObject,
} from "./world";

type Tool = "manos" | "semillas" | "limpieza";
type Inventory = { seeds: number; trash: number; samples: number };
type FireEvent = { id: string; x: number; y: number; startedAt: number };
type SaveData = {
  seed: number;
  x: number;
  y: number;
  inventory: Inventory;
  removed: string[];
  planted: WorldObject[];
  health: Record<string, number>;
  species: string[];
  stats: { trash: number; trees: number; water: number; fires: number; steps: number };
  fires: FireEvent[];
  gameTime: number;
};

type Snapshot = {
  biome: Biome;
  health: number;
  inventory: Inventory;
  species: string[];
  stats: SaveData["stats"];
  time: string;
  weather: string;
  mission: { text: string; progress: number; goal: number };
  tool: Tool;
  saved: boolean;
};

const SAVE_KEY = "guardianes-del-brote-v1";
const defaultInventory = { seeds: 8, trash: 0, samples: 0 };
const facts = [
  "Los humedales filtran agua y reducen el impacto de las inundaciones.",
  "Una botella de plástico puede tardar siglos en degradarse.",
  "Las plantas nativas ofrecen alimento y refugio a la fauna local.",
  "Los bosques saludables almacenan carbono y regulan la temperatura.",
  "Separar residuos permite recuperar materiales y usar menos recursos.",
  "Los insectos polinizadores sostienen gran parte de los ecosistemas.",
  "Ahorrar agua también reduce la energía necesaria para tratarla.",
];

function freshSave(): SaveData {
  return {
    seed: Math.floor(Math.random() * 2_000_000_000),
    x: 12,
    y: 12,
    inventory: { ...defaultInventory },
    removed: [],
    planted: [],
    health: {},
    species: [],
    stats: { trash: 0, trees: 0, water: 0, fires: 0, steps: 0 },
    fires: [],
    gameTime: 510,
  };
}

function loadSave(): SaveData {
  try {
    const value = localStorage.getItem(SAVE_KEY);
    if (value) {
      const base = freshSave();
      const stored = JSON.parse(value);
      return {
        ...base,
        ...stored,
        inventory: { ...base.inventory, ...stored.inventory },
        stats: { ...base.stats, ...stored.stats },
        fires: stored.fires ?? [],
      };
    }
  } catch {
    // A fresh world still works if storage is unavailable.
  }
  return freshSave();
}

function drawPixelPerson(ctx: CanvasRenderingContext2D, x: number, y: number, direction: number, moving: boolean) {
  const bob = moving ? Math.round(Math.sin(performance.now() / 90) * 1.5) : 0;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.fillStyle = "rgba(20,42,32,.24)";
  ctx.beginPath();
  ctx.ellipse(0, 10, 9, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#332a2a";
  ctx.roundRect(-5, 4, 4, 8, 2);
  ctx.roundRect(2, 4, 4, 8, 2);
  ctx.fill();
  ctx.fillStyle = "#f2d34f";
  ctx.beginPath();
  ctx.roundRect(-7, -3, 14, 10, 4);
  ctx.fill();
  ctx.fillStyle = "#2b7655";
  ctx.beginPath();
  ctx.roundRect(-7, 0, 14, 7, 3);
  ctx.fill();
  ctx.fillStyle = "#174d3d";
  ctx.beginPath();
  ctx.roundRect(-9, -1, 4, 8, 2);
  ctx.fill();
  ctx.fillStyle = "#f0bb77";
  ctx.beginPath();
  ctx.arc(0, -8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3b2e32";
  ctx.beginPath();
  ctx.arc(-1, -10, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(direction < 0 ? -2.5 : 2.5, -7.5, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAnimal(ctx: CanvasRenderingContext2D, object: WorldObject, time: number) {
  const species = object.species ?? "";
  const phase = time / 1000 + object.x * 0.013 + object.y * 0.007;
  const facesRight = Math.sin(phase * 0.42) > 0;
  const direction = facesRight ? 1 : -1;
  const birds = ["Petirrojo", "Águila", "Pato", "Gaviota", "Tucán", "Garza", "Búho", "Cuervo"];
  const insects = ["Abeja", "Mariposa", "Libélula"];
  const hopping = ["Conejo", "Liebre", "Rana"];
  const small = ["Ardilla", "Lagartija", "Cangrejo", "Correcaminos"];

  ctx.scale(direction, 1);
  if (insects.some((name) => species.includes(name))) {
    const flutter = Math.sin(phase * 12) * 3;
    ctx.translate(Math.sin(phase * 2.2) * 10, -8 + Math.sin(phase * 4) * 4);
    ctx.fillStyle = species.includes("Abeja") ? "#e4b83f" : species.includes("Libélula") ? "#65bdb2" : "#6c8ed4";
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.ellipse(-3, -2, 4, Math.max(1, 3 + flutter), -0.45, 0, Math.PI * 2);
    ctx.ellipse(3, -2, 4, Math.max(1, 3 - flutter), 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#3f382a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (species.includes("Abeja")) {
      ctx.strokeStyle = "#f3d66a";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-1, -2);
      ctx.lineTo(-1, 2);
      ctx.moveTo(2, -1.5);
      ctx.lineTo(2, 1.5);
      ctx.stroke();
    }
    return;
  }

  if (birds.some((name) => species.includes(name))) {
    const grounded = species.includes("Pato") || species.includes("Garza");
    const wing = Math.sin(phase * (grounded ? 3 : 7));
    ctx.translate(Math.sin(phase * 0.8) * 9, grounded ? Math.abs(Math.sin(phase * 3)) * -1 : -8 + Math.sin(phase * 2) * 3);
    const color = species.includes("Tucán") ? "#263b35" : species.includes("Gaviota") ? "#e9e8dc" : species.includes("Pato") ? "#4d7b54" : species.includes("Cuervo") ? "#303a3d" : "#8a6648";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4.8, 0, 0, Math.PI * 2);
    ctx.arc(5, -4, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-1, wing * 2, 6, 2.8 + Math.abs(wing) * 2, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = species.includes("Tucán") ? "#e9ae38" : "#d6a746";
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.lineTo(13, -2.5);
    ctx.lineTo(8, -1.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#172724";
    ctx.beginPath();
    ctx.arc(6, -5, 0.8, 0, Math.PI * 2);
    ctx.fill();
    if (grounded) {
      ctx.strokeStyle = "#5b4631";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-2, 4);
      ctx.lineTo(-3, 8);
      ctx.moveTo(3, 4);
      ctx.lineTo(4, 8);
      ctx.stroke();
    }
    return;
  }

  if (species.includes("Nutria")) {
    ctx.translate(Math.sin(phase) * 8, Math.sin(phase * 3) * 1.5);
    ctx.fillStyle = "#76513b";
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.arc(7, -3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#76513b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.quadraticCurveTo(-14, 4, -16, 0);
    ctx.stroke();
    ctx.fillStyle = "#1d2927";
    ctx.beginPath();
    ctx.arc(8, -4, 0.8, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (hopping.some((name) => species.includes(name))) {
    const hopCycle = Math.max(0, Math.sin(phase * 4));
    ctx.translate(Math.sin(phase) * 7, -hopCycle * 7);
    const color = species.includes("Rana") ? "#64a84f" : species.includes("ártica") ? "#e5e8df" : "#9b7658";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.5, 5, 0, 0, Math.PI * 2);
    ctx.arc(6, -3.5, 4, 0, Math.PI * 2);
    ctx.fill();
    if (!species.includes("Rana")) {
      ctx.beginPath();
      ctx.ellipse(5, -9, 1.8, 6, 0.16, 0, Math.PI * 2);
      ctx.ellipse(8, -8, 1.7, 5.5, 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#1e2824";
    ctx.beginPath();
    ctx.arc(7, -4, 0.9, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (species.includes("Mono")) {
    const armSwing = Math.sin(phase * 4) * 4;
    ctx.translate(Math.sin(phase * 0.7) * 6, Math.abs(Math.sin(phase * 2)) * -2);
    ctx.fillStyle = "#654735";
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 7, 0, 0, Math.PI * 2);
    ctx.arc(2, -8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#654735";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.lineTo(-8, 5 + armSwing);
    ctx.moveTo(4, -2);
    ctx.lineTo(8, 5 - armSwing);
    ctx.stroke();
    ctx.fillStyle = "#c18d62";
    ctx.beginPath();
    ctx.ellipse(3, -7, 3, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const walk = Math.sin(phase * (small.some((name) => species.includes(name)) ? 6 : 3.5));
  ctx.translate(Math.sin(phase * 0.65) * 9, Math.abs(walk) * -1.2);
  const color = species.includes("Zorro") ? "#bb623d" : species.includes("Ciervo") ? "#8c6543" : species.includes("nival") ? "#dddcd1" : "#6b5140";
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -1, small.some((name) => species.includes(name)) ? 6 : 8, small.some((name) => species.includes(name)) ? 4 : 5, 0, 0, Math.PI * 2);
  ctx.arc(7, -5, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(5, -8);
  ctx.lineTo(7, -13);
  ctx.lineTo(9, -8);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-5, 2);
  ctx.lineTo(-5 + walk * 1.5, 7);
  ctx.moveTo(4, 2);
  ctx.lineTo(4 - walk * 1.5, 7);
  ctx.stroke();
  ctx.fillStyle = "#1d2927";
  ctx.beginPath();
  ctx.arc(8, -6, 0.9, 0, Math.PI * 2);
  ctx.fill();
  if (species.includes("Zorro") || species.includes("Ardilla")) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-7, -2);
    ctx.quadraticCurveTo(-14, -9, -15, -2);
    ctx.stroke();
  }
}

function drawObject(ctx: CanvasRenderingContext2D, object: WorldObject, sx: number, sy: number, time: number) {
  ctx.save();
  ctx.translate(sx, sy);
  if (object.type === "tree") {
    ctx.rotate(Math.sin(time / 1100 + object.x * 0.01) * 0.025);
    ctx.fillStyle = "#704b2a";
    ctx.beginPath();
    ctx.roundRect(-3, -7, 6, 17, 2);
    ctx.fill();
    ctx.fillStyle = object.variant % 2 ? "#1f6a3b" : "#2c7c42";
    ctx.beginPath();
    ctx.arc(0, -12, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#43a64e";
    ctx.beginPath();
    ctx.arc(-4, -16, 6, 0, Math.PI * 2);
    ctx.arc(5, -14, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (object.type === "plant") {
    ctx.fillStyle = "#27633c";
    ctx.fillRect(-1, -6, 2, 9);
    ctx.fillStyle = object.variant % 2 ? "#f1ca4b" : "#e889a8";
    ctx.beginPath();
    ctx.arc(-3, -6, 3, 0, Math.PI * 2);
    ctx.arc(3, -8, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (object.type === "trash") {
    ctx.fillStyle = "#d8e2d4";
    ctx.beginPath();
    ctx.roundRect(-5, -5, 9, 8, 2);
    ctx.fill();
    ctx.fillStyle = object.variant % 2 ? "#e05b47" : "#4e75bb";
    ctx.beginPath();
    ctx.roundRect(-3, -7, 7, 3, 1);
    ctx.fill();
    ctx.fillStyle = "#48534f";
    ctx.beginPath();
    ctx.arc(4, 2, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (object.type === "oil") {
    ctx.fillStyle = "rgba(32,40,39,.78)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9ea24a";
    ctx.beginPath();
    ctx.ellipse(3, -1, 2, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawAnimal(ctx, object, time);
  }
  ctx.restore();
}

function drawFireIncident(ctx: CanvasRenderingContext2D, fire: FireEvent, sx: number, sy: number, time: number) {
  const age = Math.max(0, time - fire.startedAt);
  const pulse = Math.sin(time / 120) * 1.5;
  ctx.save();
  ctx.translate(sx, sy);

  ctx.fillStyle = "rgba(34, 42, 37, .18)";
  ctx.beginPath();
  ctx.ellipse(0, 7, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5b3828";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-9, 7);
  ctx.lineTo(9, -1);
  ctx.moveTo(-8, -1);
  ctx.lineTo(9, 7);
  ctx.stroke();

  ctx.fillStyle = "rgba(73, 78, 70, .22)";
  for (let i = 0; i < 3; i += 1) {
    const drift = (age / (22 + i * 5) + i * 9) % 28;
    ctx.beginPath();
    ctx.arc(Math.sin(time / 420 + i) * 4, -14 - drift, 4 + drift * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#e85d31";
  ctx.beginPath();
  ctx.ellipse(0, -3, 8 + pulse, 13 - pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f5c84c";
  ctx.beginPath();
  ctx.ellipse(1, 0, 4 + pulse * 0.4, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  const escape = Math.min(58, age / 45);
  ctx.translate(24 + escape, 1);
  ctx.fillStyle = "#253d4d";
  ctx.beginPath();
  ctx.roundRect(-5, 3, 4, 9, 2);
  ctx.roundRect(2, 3, 4, 9, 2);
  ctx.fill();
  ctx.fillStyle = "#b94f3d";
  ctx.beginPath();
  ctx.roundRect(-7, -7, 14, 12, 4);
  ctx.fill();
  ctx.fillStyle = "#d79c6a";
  ctx.beginPath();
  ctx.arc(0, -12, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#473128";
  ctx.beginPath();
  ctx.arc(-1, -14, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(loadSave());
  const keys = useRef(new Set<string>());
  const joystick = useRef({ x: 0, y: 0 });
  const chunks = useRef(new Map<string, ChunkData>());
  const removed = useRef(new Set(gameRef.current.removed));
  const fires = useRef<FireEvent[]>(gameRef.current.fires);
  const lastAction = useRef(0);
  const [panel, setPanel] = useState<"inventory" | "map" | "guide" | null>(null);
  const [toast, setToast] = useState("Tu misión comienza: cuida cada lugar que descubras.");
  const [fact, setFact] = useState(facts[0]);
  const [tool, setTool] = useState<Tool>("manos");
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({
    biome: "pradera",
    health: 55,
    inventory: gameRef.current.inventory,
    species: gameRef.current.species,
    stats: gameRef.current.stats,
    time: "08:30",
    weather: "Despejado",
    mission: { text: "Recoge residuos", progress: gameRef.current.stats.trash, goal: 5 },
    tool: "manos",
    saved: true,
  }));

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? "" : current)), 3800);
  }, []);

  const cycleTool = useCallback(() => {
    setTool((current) => {
      const next = current === "manos" ? "semillas" : current === "semillas" ? "limpieza" : "manos";
      notify(`Herramienta: ${next}`);
      return next;
    });
  }, [notify]);

  const getChunk = useCallback((cx: number, cy: number) => {
    const save = gameRef.current;
    const key = chunkKey(cx, cy);
    let chunk = chunks.current.get(key);
    if (!chunk) {
      chunk = generateChunk(cx, cy, save.seed, save.health[key] ?? 55);
      const minX = cx * CHUNK * TILE;
      const minY = cy * CHUNK * TILE;
      const maxX = minX + CHUNK * TILE;
      const maxY = minY + CHUNK * TILE;
      const planted = save.planted.filter((item) => item.x >= minX && item.x < maxX && item.y >= minY && item.y < maxY);
      chunk.objects.push(...planted);
      chunks.current.set(key, chunk);
      if (chunks.current.size > 81) {
        const first = chunks.current.keys().next().value;
        if (first) chunks.current.delete(first);
      }
    }
    return chunk;
  }, []);

  const nearbyObject = useCallback(() => {
    const save = gameRef.current;
    const cx = Math.floor(save.x / (CHUNK * TILE));
    const cy = Math.floor(save.y / (CHUNK * TILE));
    let closest: WorldObject | null = null;
    let distance = 42;
    for (let y = cy - 1; y <= cy + 1; y += 1) {
      for (let x = cx - 1; x <= cx + 1; x += 1) {
        for (const object of getChunk(x, y).objects) {
          if (removed.current.has(object.id)) continue;
          const d = Math.hypot(object.x - save.x, object.y - save.y);
          if (d < distance) {
            distance = d;
            closest = object;
          }
        }
      }
    }
    return closest;
  }, [getChunk]);

  const interact = useCallback(() => {
    if (performance.now() - lastAction.current < 280) return;
    lastAction.current = performance.now();
    const save = gameRef.current;
    const tx = Math.floor(save.x / TILE);
    const ty = Math.floor(save.y / TILE);
    const cx = Math.floor(tx / CHUNK);
    const cy = Math.floor(ty / CHUNK);
    const key = chunkKey(cx, cy);
    const biome = getBiome(tx, ty, save.seed);
    const object = nearbyObject();
    const nearbyFire = fires.current
      .map((fire) => ({ fire, distance: Math.hypot(fire.x - save.x, fire.y - save.y) }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (nearbyFire && nearbyFire.distance < 58) {
      fires.current = fires.current.filter((fire) => fire.id !== nearbyFire.fire.id);
      save.fires = fires.current;
      save.stats.fires += 1;
      save.health[key] = Math.min(100, (save.health[key] ?? 55) + 7);
      notify("Quema apagada. Evitaste que el fuego se extendiera.");
    } else if (object?.type === "trash" || object?.type === "oil") {
      removed.current.add(object.id);
      save.removed = [...removed.current];
      save.inventory.trash += 1;
      save.stats.trash += 1;
      if (biome === "agua") save.stats.water += 1;
      save.health[key] = Math.min(100, (save.health[key] ?? 55) + (object.type === "oil" ? 8 : 4));
      notify(object.type === "oil" ? "Mancha retirada. El agua respira mejor." : "Residuo recogido. Llévalo contigo para reciclar.");
      if (save.stats.trash === 5) {
        save.inventory.seeds += 5;
        notify("Misión cumplida. Recibes 5 semillas nativas.");
      }
    } else if (object?.type === "animal" && object.species) {
      if (!save.species.includes(object.species)) {
        save.species.push(object.species);
        save.inventory.samples += 1;
        notify(`Nueva especie registrada: ${object.species}`);
      } else {
        notify(`${object.species}: parece sentirse a salvo en este ecosistema.`);
      }
    } else if (tool === "semillas") {
      if (biome === "agua" || biome === "playa" || biome === "montana") {
        notify("Busca suelo fértil para plantar esta semilla.");
      } else if (save.inventory.seeds <= 0) {
        notify("No quedan semillas. Completa misiones para obtener más.");
      } else {
        const planted: WorldObject = {
          id: `planted:${Date.now()}`,
          type: "tree",
          x: Math.round(save.x / TILE) * TILE,
          y: Math.round(save.y / TILE) * TILE,
          variant: save.stats.trees % 4,
        };
        save.planted.push(planted);
        save.inventory.seeds -= 1;
        save.stats.trees += 1;
        save.health[key] = Math.min(100, (save.health[key] ?? 55) + 5);
        chunks.current.clear();
        notify("Árbol nativo plantado. Con el tiempo dará refugio y sombra.");
      }
    } else if (biome === "agua" && tool === "limpieza") {
      save.stats.water += 1;
      save.health[key] = Math.min(100, (save.health[key] ?? 55) + 2);
      notify("Has retirado microresiduos del agua.");
    } else if (object?.type === "plant") {
      notify("Planta observada. Las flores locales alimentan a los polinizadores.");
    } else {
      notify("No hay nada que cuidar aquí. Explora un poco más.");
    }
    setFact(facts[(save.stats.trash + save.stats.trees + save.stats.water) % facts.length]);
  }, [nearbyObject, notify, tool]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keys.current.add(key);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (key === "e" || key === " ") interact();
      if (key === "q" || key === "t") cycleTool();
      if (key === "i") setPanel((value) => (value === "inventory" ? null : "inventory"));
      if (key === "m") setPanel((value) => (value === "map" ? null : "map"));
      if (key === "escape") setPanel(null);
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [cycleTool, interact]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    let frame = 0;
    let previous = performance.now();
    let uiTimer = 0;
    let autoSave = 0;
    let incidentTimer = 10;
    let fireDamageTimer = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.imageSmoothingEnabled = true;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const loop = (now: number) => {
      const dt = Math.min(0.04, (now - previous) / 1000);
      previous = now;
      const save = gameRef.current;
      let dx = joystick.current.x;
      let dy = joystick.current.y;
      if (keys.current.has("a") || keys.current.has("arrowleft")) dx -= 1;
      if (keys.current.has("d") || keys.current.has("arrowright")) dx += 1;
      if (keys.current.has("w") || keys.current.has("arrowup")) dy -= 1;
      if (keys.current.has("s") || keys.current.has("arrowdown")) dy += 1;
      const length = Math.hypot(dx, dy);
      if (length > 0) {
        const speed = 92;
        save.x += (dx / Math.max(1, length)) * speed * dt;
        save.y += (dy / Math.max(1, length)) * speed * dt;
        save.stats.steps += speed * dt;
      }
      save.gameTime = (save.gameTime + dt * 1.7) % 1440;
      incidentTimer -= dt;
      fireDamageTimer += dt;
      if (incidentTimer <= 0 && fires.current.length < 2) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 150 + Math.random() * 100;
        const x = save.x + Math.cos(angle) * distance;
        const y = save.y + Math.sin(angle) * distance;
        const biome = getBiome(Math.floor(x / TILE), Math.floor(y / TILE), save.seed);
        if (!["agua", "playa", "frio", "montana"].includes(biome)) {
          const fire = { id: `fire:${Date.now()}`, x, y, startedAt: now };
          fires.current.push(fire);
          save.fires = fires.current;
          const fireKey = chunkKey(Math.floor(x / (CHUNK * TILE)), Math.floor(y / (CHUNK * TILE)));
          save.health[fireKey] = Math.max(5, (save.health[fireKey] ?? 55) - 12);
          notify("Alerta: alguien ha iniciado una quema cerca. Encuentra el humo y apágala.");
        }
        incidentTimer = 38 + Math.random() * 42;
      }
      if (fireDamageTimer > 8) {
        fireDamageTimer = 0;
        fires.current.forEach((fire) => {
          const fireKey = chunkKey(Math.floor(fire.x / (CHUNK * TILE)), Math.floor(fire.y / (CHUNK * TILE)));
          save.health[fireKey] = Math.max(5, (save.health[fireKey] ?? 55) - 1);
        });
      }

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const cameraX = save.x - width / 2;
      const cameraY = save.y - height / 2;
      const minTx = Math.floor(cameraX / TILE) - 1;
      const maxTx = Math.ceil((cameraX + width) / TILE) + 1;
      const minTy = Math.floor(cameraY / TILE) - 1;
      const maxTy = Math.ceil((cameraY + height) / TILE) + 1;

      ctx.fillStyle = "#5a9455";
      ctx.fillRect(0, 0, width, height);
      for (let ty = minTy; ty <= maxTy; ty += 1) {
        for (let tx = minTx; tx <= maxTx; tx += 1) {
          const biome = getBiome(tx, ty, save.seed);
          const info = biomeInfo[biome];
          ctx.fillStyle = info.ground;
          ctx.fillRect(tx * TILE - cameraX, ty * TILE - cameraY, TILE + 1, TILE + 1);
          const variation = tileVariation(tx, ty, save.seed);
          const detail = tileVariation(tx + 193, ty - 271, save.seed);
          const tileX = tx * TILE - cameraX;
          const tileY = ty * TILE - cameraY;
          if (variation > 0.58) {
            ctx.fillStyle = variation > 0.8 ? "rgba(255,255,255,.025)" : "rgba(15,48,35,.028)";
            ctx.beginPath();
            ctx.arc(tileX + detail * TILE, tileY + variation * TILE, 5 + detail * 4, 0, Math.PI * 2);
            ctx.fill();
          }
          if (variation > 0.76) {
            ctx.fillStyle = info.accent;
            const px = tileX + 5 + variation * 7;
            const py = tileY + 7 + variation * 5;
            if (biome === "agua") {
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = info.accent;
              ctx.beginPath();
              ctx.moveTo(px - 5, py);
              ctx.quadraticCurveTo(px, py - 2, px + 6, py);
              ctx.stroke();
            } else if (biome === "playa" || biome === "seco") {
              ctx.fillStyle = biome === "playa" ? "rgba(111,83,41,.28)" : "rgba(102,64,34,.24)";
              ctx.beginPath();
              ctx.arc(px, py, 1.3, 0, Math.PI * 2);
              ctx.arc(px + 7, py + 4, 0.9, 0, Math.PI * 2);
              ctx.fill();
            } else if (biome === "montana") {
              ctx.strokeStyle = "rgba(53,67,62,.28)";
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(px - 5, py + 4);
              ctx.lineTo(px, py - 3);
              ctx.lineTo(px + 6, py + 4);
              ctx.stroke();
            } else if (biome === "frio") {
              ctx.fillStyle = "rgba(255,255,255,.68)";
              ctx.beginPath();
              ctx.arc(px, py, 1.6, 0, Math.PI * 2);
              ctx.arc(px + 6, py - 4, 1, 0, Math.PI * 2);
              ctx.fill();
            } else if (biome === "contaminado") {
              ctx.fillStyle = "rgba(54,55,39,.3)";
              ctx.beginPath();
              ctx.ellipse(px, py, 5, 2, detail, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.strokeStyle = info.accent;
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(px, py + 4);
              ctx.quadraticCurveTo(px - 2, py, px - 4, py - 2);
              ctx.moveTo(px, py + 4);
              ctx.quadraticCurveTo(px + 2, py - 1, px + 4, py - 3);
              ctx.stroke();
            }
          }
        }
      }

      const minCx = Math.floor(minTx / CHUNK);
      const maxCx = Math.floor(maxTx / CHUNK);
      const minCy = Math.floor(minTy / CHUNK);
      const maxCy = Math.floor(maxTy / CHUNK);
      const visibleObjects: WorldObject[] = [];
      for (let cy = minCy; cy <= maxCy; cy += 1) {
        for (let cx = minCx; cx <= maxCx; cx += 1) {
          visibleObjects.push(...getChunk(cx, cy).objects);
        }
      }
      visibleObjects
        .filter((object) => !removed.current.has(object.id))
        .sort((a, b) => a.y - b.y)
        .forEach((object) => drawObject(ctx, object, object.x - cameraX, object.y - cameraY, now));
      fires.current.forEach((fire) => {
        if (Math.abs(fire.x - save.x) < width && Math.abs(fire.y - save.y) < height) {
          drawFireIncident(ctx, fire, fire.x - cameraX, fire.y - cameraY, now);
        }
      });
      drawPixelPerson(ctx, width / 2, height / 2, dx, length > 0);

      const dayPhase = save.gameTime / 1440;
      const darkness = dayPhase < 0.22 ? 0.46 - dayPhase : dayPhase > 0.76 ? (dayPhase - 0.76) * 1.6 : 0;
      if (darkness > 0) {
        ctx.fillStyle = `rgba(16,31,62,${Math.min(0.48, darkness)})`;
        ctx.fillRect(0, 0, width, height);
      }
      const weatherIndex = Math.floor((save.gameTime + (save.seed % 1000)) / 180) % 4;
      if (weatherIndex === 1) {
        ctx.strokeStyle = "rgba(206,235,239,.45)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 45; i += 1) {
          const rx = (i * 83 + now / 9) % (width + 30);
          const ry = (i * 47 + now / 4) % height;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 5, ry + 10);
          ctx.stroke();
        }
      } else if (weatherIndex === 2) {
        ctx.fillStyle = "rgba(226,236,225,.13)";
        ctx.fillRect(0, 0, width, height);
      }

      uiTimer += dt;
      autoSave += dt;
      if (uiTimer > 0.25) {
        uiTimer = 0;
        const tx = Math.floor(save.x / TILE);
        const ty = Math.floor(save.y / TILE);
        const biome = getBiome(tx, ty, save.seed);
        const key = chunkKey(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK));
        const hours = Math.floor(save.gameTime / 60);
        const minutes = Math.floor(save.gameTime % 60);
        const mission =
          fires.current.length > 0
            ? { text: "Apaga la quema cercana", progress: 0, goal: 1 }
            : save.stats.trash < 5
            ? { text: "Recoge residuos", progress: save.stats.trash, goal: 5 }
            : save.stats.trees < 5
              ? { text: "Planta árboles nativos", progress: save.stats.trees, goal: 5 }
              : { text: "Recupera fuentes de agua", progress: save.stats.water, goal: 10 };
        setSnapshot({
          biome,
          health: Math.round(save.health[key] ?? (biome === "contaminado" ? 28 : 55)),
          inventory: { ...save.inventory },
          species: [...save.species],
          stats: { ...save.stats },
          time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
          weather: ["Despejado", "Lluvia suave", "Niebla", "Soleado"][weatherIndex],
          mission,
          tool,
          saved: autoSave < 0.8,
        });
      }
      if (autoSave > 12) {
        autoSave = 0;
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(save));
        } catch {
          // Continue playing if storage is full or blocked.
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(gameRef.current));
      } catch {
        // No-op.
      }
    };
  }, [getChunk, tool]);

  const startJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const update = (clientX: number, clientY: number) => {
      const rect = target.getBoundingClientRect();
      const x = clientX - (rect.left + rect.width / 2);
      const y = clientY - (rect.top + rect.height / 2);
      const distance = Math.min(34, Math.hypot(x, y));
      const angle = Math.atan2(y, x);
      joystick.current = { x: (Math.cos(angle) * distance) / 34, y: (Math.sin(angle) * distance) / 34 };
      target.style.setProperty("--stick-x", `${Math.cos(angle) * distance}px`);
      target.style.setProperty("--stick-y", `${Math.sin(angle) * distance}px`);
    };
    update(event.clientX, event.clientY);
  };

  const moveJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.min(34, Math.hypot(x, y));
      const angle = Math.atan2(y, x);
      joystick.current = { x: (Math.cos(angle) * distance) / 34, y: (Math.sin(angle) * distance) / 34 };
      event.currentTarget.style.setProperty("--stick-x", `${Math.cos(angle) * distance}px`);
      event.currentTarget.style.setProperty("--stick-y", `${Math.sin(angle) * distance}px`);
    }
  };

  const endJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    joystick.current = { x: 0, y: 0 };
    event.currentTarget.style.setProperty("--stick-x", "0px");
    event.currentTarget.style.setProperty("--stick-y", "0px");
  };

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Mundo natural de Guardianes del Brote" />
      <header className="top-hud">
        <div className="brand-card pixel-panel">
          <span className="brand-mark" aria-hidden="true"><i /></span>
          <div><strong>GUARDIANES</strong><small>DEL BROTE</small></div>
        </div>
        <div className="world-card pixel-panel">
          <div><span className="status-dot" />{biomeInfo[snapshot.biome].label}</div>
          <span>{snapshot.time} · {snapshot.weather}</span>
        </div>
        <div className="health-card pixel-panel">
          <div><span>Salud del ecosistema</span><strong>{snapshot.health}%</strong></div>
          <div className="health-track"><i style={{ width: `${snapshot.health}%` }} /></div>
        </div>
      </header>

      <aside className="mission-card pixel-panel">
        <span className="eyebrow">MISIÓN ACTIVA</span>
        <strong>{snapshot.mission.text}</strong>
        <div className="mission-progress">
          <i style={{ width: `${Math.min(100, snapshot.mission.progress / snapshot.mission.goal * 100)}%` }} />
        </div>
        <small>{Math.min(snapshot.mission.progress, snapshot.mission.goal)} / {snapshot.mission.goal}</small>
      </aside>

      <nav className="quick-menu" aria-label="Menú del juego">
        <button onClick={() => setPanel(panel === "inventory" ? null : "inventory")}><span className="bag-icon" />Inventario <kbd>I</kbd></button>
        <button onClick={() => setPanel(panel === "map" ? null : "map")}><span className="map-icon" />Mapa <kbd>M</kbd></button>
        <button onClick={() => setPanel(panel === "guide" ? null : "guide")}><span className="book-icon" />Bitácora</button>
      </nav>

      {toast && <div className="toast pixel-panel">{toast}</div>}
      <div className="fact-card pixel-panel"><span>¿SABÍAS QUE?</span><p>{fact}</p></div>

      <div
        className="joystick"
        aria-label="Control de movimiento"
        onPointerDown={startJoystick}
        onPointerMove={moveJoystick}
        onPointerUp={endJoystick}
        onPointerCancel={endJoystick}
      ><i /></div>
      <div className="action-controls">
        <button className="tool-button" onClick={cycleTool}><span className={`tool-symbol ${tool}`} />{tool}<small>Q</small></button>
        <button className="action-button" onClick={interact}><span>!</span>ACTUAR<small>E</small></button>
      </div>

      <footer className="desktop-help">Mover: WASD / flechas <i /> Actuar: E <i /> Herramienta: Q <i /> Inventario: I</footer>

      {panel && (
        <section className="modal-backdrop" onPointerDown={(event) => event.target === event.currentTarget && setPanel(null)}>
          <div className="game-modal pixel-panel">
            <button className="close-button" onClick={() => setPanel(null)} aria-label="Cerrar">×</button>
            {panel === "inventory" && (
              <>
                <span className="eyebrow">MOCHILA DE CAMPO</span>
                <h2>Inventario</h2>
                <div className="inventory-grid">
                  <article><span className="seed-art" /><strong>{snapshot.inventory.seeds}</strong><small>Semillas nativas</small></article>
                  <article><span className="trash-art" /><strong>{snapshot.inventory.trash}</strong><small>Residuos recogidos</small></article>
                  <article><span className="sample-art" /><strong>{snapshot.inventory.samples}</strong><small>Registros naturales</small></article>
                  <article><span className="tool-art" /><strong>3</strong><small>Herramientas</small></article>
                </div>
                <p className="modal-note">Selecciona Semillas con Q y pulsa E sobre suelo fértil para plantar.</p>
              </>
            )}
            {panel === "guide" && (
              <>
                <span className="eyebrow">CUADERNO NATURALISTA</span>
                <h2>Especies descubiertas</h2>
                {snapshot.species.length ? (
                  <div className="species-list">{snapshot.species.map((name) => <span key={name}>{name}</span>)}</div>
                ) : <p className="empty-state">Acércate a un animal y pulsa E para registrarlo. Los ecosistemas sanos atraen más fauna.</p>}
                <div className="stats-row">
                  <div><strong>{snapshot.stats.trash}</strong><small>residuos</small></div>
                  <div><strong>{snapshot.stats.trees}</strong><small>árboles</small></div>
                  <div><strong>{snapshot.stats.water}</strong><small>aguas cuidadas</small></div>
                  <div><strong>{snapshot.stats.fires}</strong><small>quemas apagadas</small></div>
                </div>
              </>
            )}
            {panel === "map" && (
              <>
                <span className="eyebrow">MAPA DE EXPLORACIÓN</span>
                <h2>Un mundo sin fronteras</h2>
                <div className="mini-map">
                  {Array.from({ length: 81 }, (_, index) => {
                    const ox = index % 9 - 4;
                    const oy = Math.floor(index / 9) - 4;
                    const tx = Math.floor(gameRef.current.x / TILE) + ox * 5;
                    const ty = Math.floor(gameRef.current.y / TILE) + oy * 5;
                    return <i key={index} style={{ background: biomeInfo[getBiome(tx, ty, gameRef.current.seed)].ground }} />;
                  })}
                  <span className="map-player" />
                </div>
                <p className="modal-note">Cada color representa un bioma. El mapa se genera por chunks a medida que caminas, en cualquier dirección.</p>
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
