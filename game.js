"use strict";

const recipes = [
  { id: "water", name: "Formação da água", result: "Água", resultIcon: "💧",
    reactants: [{ name: "Hidrogénio", formula: "H₂", atoms: { H: 2 } }, { name: "Oxigénio", formula: "O₂", atoms: { O: 2 } }],
    products: [{ formula: "H₂O", atoms: { H: 2, O: 1 } }], coefficients: [2, 1, 2],
    fact: "2 H₂ + O₂ → 2 H₂O: há quatro átomos de H e dois de O em cada lado." },
  { id: "rust", name: "Corrosão do ferro", result: "Hidróxido férrico", resultIcon: "🧪",
    reactants: [{ name: "Ferro", formula: "Fe", atoms: { Fe: 1 } }, { name: "Oxigénio", formula: "O₂", atoms: { O: 2 } }, { name: "Água", formula: "H₂O", atoms: { H: 2, O: 1 } }],
    products: [{ formula: "Fe(OH)₃", atoms: { Fe: 1, O: 3, H: 3 } }], coefficients: [4, 3, 6, 4],
    fact: "A corrosão do ferro pode ser representada por 4 Fe + 3 O₂ + 6 H₂O → 4 Fe(OH)₃. O produto pode dar origem à ferrugem." },
  { id: "oxide", name: "Formação do óxido de ferro", result: "Óxido de ferro", resultIcon: "🔩",
    reactants: [{ name: "Ferro", formula: "Fe", atoms: { Fe: 1 } }, { name: "Oxigénio", formula: "O₂", atoms: { O: 2 } }],
    products: [{ formula: "Fe₂O₃", atoms: { Fe: 2, O: 3 } }], coefficients: [4, 3, 2],
    fact: "4 Fe + 3 O₂ → 2 Fe₂O₃: há quatro átomos de Fe e seis de O em cada lado." }
];

const stations = [
  { x: 4, y: 3, type: "reactor", label: "Equação", island: true }
];

const levels = [
  { recipe: "water", name: "Fase 1 · Água", mode: "lab", goal: 1, seconds: 120, obstacle: "crate", obstacles: [[1, 1], [7, 5]] },
  { recipe: "rust", name: "Fase 2 · Travessia", mode: "road", goal: 1, seconds: 180, obstacles: [] },
  { recipe: "oxide", name: "Fase 3 · Labirinto", mode: "maze", goal: 1, seconds: 150, obstacles: [] }
];

const mazeWalls = [
  ...[1, 5].map(y => [2, y]),
  ...[0, 1, 5, 6].map(y => [4, y]),
  ...[1, 5].map(y => [6, y])
];

const reactionBenches = [
  ...Array.from({ length: 9 }, (_, index) => ({ x: index, y: 0 })),
  ...Array.from({ length: 6 }, (_, index) => ({ x: 8, y: index + 1 })),
  ...Array.from({ length: 8 }, (_, index) => ({ x: 7 - index, y: 6 })),
  ...Array.from({ length: 5 }, (_, index) => ({ x: 0, y: 5 - index }))
];
const reactionIsland = [
  { x: 3, y: 3, type: "island-bench", label: "Bancada", island: true },
  { x: 5, y: 3, type: "delivery", label: "Entregar", island: true }
];

const board = document.querySelector("#board");
const ordersElement = document.querySelector("#orders");
const clockElement = document.querySelector("#clock");
const scoreElement = document.querySelector("#score");
const deliveriesElement = document.querySelector("#deliveries");
const inventoryElement = document.querySelector("#inventory");
const messageElement = document.querySelector("#message");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#start-button");
const modalTitle = document.querySelector("#modal-title");
const modalDescription = document.querySelector("#modal-description");
const modalIcon = document.querySelector("#modal-icon");
const modalEyebrow = document.querySelector(".modal .eyebrow");
const modalControls = document.querySelector(".modal-controls");
const fullscreenButton = document.querySelector("#fullscreen-button");
const fullscreenStatus = document.querySelector("#fullscreen-status");
const equationOverlay = document.querySelector("#equation-overlay");
const equationFeedback = document.querySelector("#equation-feedback");
const equationForm = document.querySelector("#equation-form");

const ORDER_SECONDS = 55;
const PROCESS_SECONDS = 2;
const STEP_DURATION = 160;
const REAGENT_SPEED = 1.5;
const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const moveKeys = { ArrowUp: "up", w: "up", ArrowDown: "down", s: "down", ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right" };
const heldDirections = new Map();
let state;
let lastFrame = 0;
let animationId;
let previousFocus;
let nextHeldStep = 0;
let orientationLocked = false;
let swipeStart = null;

function recipeById(id) {
  return recipes.find(recipe => recipe.id === id);
}

function levelStations() {
  const level = levels[state.level];
  const recipe = recipeById(level.recipe);
  const active = [...stations, ...(level.mode === "road" ? [{ x: 7, y: 5, type: "delivery", label: "Entregar" }] : reactionIsland)];
  level.obstacles.forEach(([x, y]) => active.push({ x, y, type: "obstacle", kind: level.obstacle }));
  const benches = level.mode === "road" || level.mode === "maze" ? [] : level.mode === "conveyor"
    ? reactionBenches.filter(bench => bench.y === 0 || bench.y === 6) : reactionBenches;
  benches.forEach(bench => active.push({ ...bench, type: "reagent-bench", belt: level.mode === "conveyor", label: "Bancada vazia" }));
  recipe.reactants.forEach((reagent, index) => {
      if (state.reaction.collected[index] || state.carrying?.reagent === index || state.reaction.balanced) return;
      if (level.mode === "road") {
          active.push({ x: 2 + index * 2, y: 1, type: "reagent-source", reagent: index, label: reagent.formula });
      } else if (level.mode === "maze") {
        active.push({ x: index === 0 ? 1 : 7, y: 1, type: "reagent-source", reagent: index, label: reagent.formula });
      } else if (level.mode === "conveyor") {
        const progress = (state.reaction.benchTime * REAGENT_SPEED) % 6;
        active.push({ x: index === 0 ? 1 + progress : 7 - progress, y: index === 0 ? 0 : 6,
          type: "moving-reagent", reagent: index, label: reagent.formula });
      } else {
        const position = (state.reaction.benchTime * REAGENT_SPEED + index * reactionBenches.length / recipe.reactants.length) % reactionBenches.length;
        const from = reactionBenches[Math.floor(position)];
        const to = reactionBenches[(Math.floor(position) + 1) % reactionBenches.length];
        const fraction = position % 1;
        active.push({ x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction,
          type: "moving-reagent", reagent: index, label: reagent.formula });
      }
  });
  if (level.mode === "road") {
    const carsPerLane = 2;
    [2, 3].forEach((lane, index) => {
      for (let car = 0; car < carsPerLane; car++) {
        const progress = (state.reaction.benchTime * (index ? 2.8 : 2.4) + car * 11 / carsPerLane + index * 1.5) % 11;
        active.push({ x: index ? 10 - progress : -1 + progress, y: lane, type: "hazard", kind: "car" });
      }
    });
  } else if (level.mode === "conveyor") {
    const position = (state.reaction.benchTime * 1.4) % 12;
    active.push({ x: 1 + (position <= 6 ? position : 12 - position), y: 2, type: "hazard", kind: "cart" });
  }
  return active;
}

function nearbyStation(activeStations) {
  const nearby = activeStations.filter(station => station.type !== "obstacle" && station.type !== "hazard" && stationIsNearby(station, state));
  if (state.carrying?.reagent !== undefined) return nearby.find(station => station.type === "reactor") || nearby.find(station => station.reagent !== undefined) || nearby[0];
  if (state.carrying?.processed) return nearby.find(station => station.type === "delivery") || nearby[0];
  return nearby.find(station => station.reagent !== undefined) || nearby.find(station => station.type === "reactor") || nearby[0];
}

function newOrder() {
  return { recipe: levels[state.level].recipe, remaining: ORDER_SECONDS };
}

function resetGame(level = 0, baseScore = 0) {
  stations.forEach(station => { delete station.item; delete station.remaining; });
  heldDirections.clear();
  const levelConfig = levels[level];
  const startY = levelConfig.mode === "road" ? 5 : levelConfig.mode === "maze" ? 6 : 4;
  stations[0].x = 4;
  stations[0].y = levelConfig.mode === "road" ? 5 : 3;
  state = {
    x: levelConfig.mode === "road" ? 1 : levelConfig.mode === "maze" ? 0 : 4,
    y: startY,
    visualX: levelConfig.mode === "road" ? 1 : levelConfig.mode === "maze" ? 0 : 4,
    visualY: startY,
    walk: 0, stepCount: 0, lastDirection: null,
    movement: null, carrying: null, remaining: levels[level].seconds, roadSide: 1,
    robot: levelConfig.mode === "maze" ? { x: 7, y: 5, moveIn: 0.6 } : null,
    level, baseScore, score: baseScore, deliveries: 0, running: true,
    status: "running", orders: [],
    reaction: { collected: recipeById(levelConfig.recipe).reactants.map(() => false), balanced: false, benchTime: 0 }
  };
  equationForm.reset();
  equationFeedback.textContent = "";
  equationOverlay.hidden = true;
  state.orders.push(newOrder());
  messageElement.textContent = "Aproxima-te de uma bancada para interagir.";
  render();
}

function setMessage(text) {
  messageElement.textContent = text;
}

function renderBoard() {
  const activeStations = levelStations();
  renderLaboratory(board, activeStations, state, PROCESS_SECONDS, mazeWalls);
  const recipe = recipeById(levels[state.level].recipe);
  const location = levels[state.level].mode === "maze" ? "Labirinto em perspetiva 3D: recolhe os reagentes, prepara a equação e evita o robô que te persegue."
    : levels[state.level].mode === "road" ? "Reagentes de um lado da estrada de duas vias; equação e entrega do outro. Evita os carros nos dois sentidos."
    : levels[state.level].mode === "conveyor" ? "Reagentes em passadeiras opostas e um carrinho em movimento. Equação e entrega na ilha central."
      : "Reagentes circulam nas bancadas. Equação e entrega na ilha central.";
  board.setAttribute("aria-label", `Laboratório 3D. ${location} Reagentes: ${recipe.reactants.map(reagent => reagent.formula).join(", ")}.`);
  const nearby = nearbyStation(activeStations);
  document.querySelector("#nearby-station").textContent = nearby
    ? `Bancada próxima: ${nearby.label}${nearby.item ? (nearby.remaining > 0 ? " (a processar)" : " (pronto)") : ""}`
    : "Nenhuma bancada por perto";
}

function renderOrders() {
  ordersElement.replaceChildren(...state.orders.map(order => {
    const recipe = recipeById(order.recipe);
    const card = document.createElement("article");
    card.className = "order";
    const icon = document.createElement("div");
    icon.className = "order-icon";
    icon.textContent = recipe.resultIcon;
    const content = document.createElement("div");
    content.className = "order-content";
    const top = document.createElement("div");
    top.className = "order-top";
    const title = document.createElement("h3");
    title.textContent = recipe.name;
    const time = document.createElement("span");
    time.className = "order-time";
    time.textContent = `${Math.ceil(order.remaining)}s`;
    const description = document.createElement("p");
    const location = levels[state.level].mode === "maze" ? "Encontra os reagentes no labirinto e foge do robô."
      : levels[state.level].mode === "road" ? "Atravessa as duas vias, evitando os carros nos dois sentidos."
        : levels[state.level].mode === "conveyor" ? "Evita o carrinho e usa as passadeiras." : "Apanha os reagentes em movimento.";
    description.textContent = `${location} Leva ${recipe.reactants.map(reagent => reagent.formula).join(", ")} à equação e entrega ${recipe.result.toLowerCase()}.`;
    top.append(title, time);
    content.append(top, description);
    const progress = document.createElement("div");
    progress.className = `order-progress${order.remaining < 15 ? " urgent" : ""}`;
    progress.style.width = `${Math.max(0, order.remaining / ORDER_SECONDS * 100)}%`;
    card.append(icon, content, progress);
    return card;
  }));
}

function render() {
  renderBoard();
  renderOrders();
  const seconds = Math.ceil(state.remaining);
  clockElement.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  scoreElement.textContent = String(state.score).padStart(3, "0");
  deliveriesElement.textContent = `${state.deliveries}/${levels[state.level].goal}`;
  document.querySelector("#level-label").textContent = `FASE ${state.level + 1} DE ${levels.length}`;
  document.querySelector("#level-description").textContent = levels[state.level].name;
  const recipe = recipeById(levels[state.level].recipe);
  document.querySelector("#objective-hint").textContent = `No reator: ${recipe.reactants.map((reagent, index) => `${reagent.formula} ${state.reaction.collected[index] ? "✓" : "em falta"}`).join(" · ")}.`;
  if (state.carrying) {
    const carriedRecipe = recipeById(state.carrying.recipe);
    const reagent = carriedRecipe.reactants[state.carrying.reagent];
    inventoryElement.textContent = reagent ? `${reagent.name} (${reagent.formula})` : carriedRecipe.result;
  } else {
    inventoryElement.textContent = "Mãos vazias";
  }
}

function updateMovement(timestamp) {
  if (!state.movement) {
    state.walk = 0;
    return false;
  }
  const movement = state.movement;
  const progress = Math.min(1, Math.max(0, (timestamp - movement.started) / STEP_DURATION));
  state.visualX = movement.x + (state.x - movement.x) * progress;
  state.visualY = movement.y + (state.y - movement.y) * progress;
  let walkValue = Math.sin(progress * Math.PI) * (state.stepCount % 2 ? 1 : -1);
  // Inverte walk se está andando para cima (para trás na perspectiva)
  if (state.lastDirection && state.lastDirection[1] < 0) {
    walkValue *= -1;
  }
  state.walk = walkValue;
  if (progress === 1) {
    state.movement = null;
    state.walk = 0;
  }
  return true;
}

function move(dx, dy, timestamp = performance.now()) {
  if (!state?.running) return;
  const x = state.x + dx;
  const y = state.y + dy;
  const mazeMode = levels[state.level].mode === "maze";
  if (mazeMode ? (x < 0 || x > 8 || y < 0 || y > 6) : (x < 1 || x > 7 || y < 1 || y > 5)) return;
  if (mazeMode && mazeWalls.some(([wx, wy]) => wx === x && wy === y)) return;
  if (levels[state.level].obstacles.some(([ox, oy]) => ox === x && oy === y)) return;
  if (levelStations().some(station => station.type !== "moving-reagent" && station.type !== "hazard" && station.x === x && station.y === y)) return;
  updateMovement(timestamp);
  state.movement = { x: state.visualX, y: state.visualY, started: timestamp };
  state.stepCount++;
  state.lastDirection = [dx, dy];
  state.x = x;
  state.y = y;
  renderBoard();
}

function startMoving(id, direction) {
  if (!state?.running || heldDirections.has(id)) return;
  heldDirections.set(id, direction);
  move(...directions[direction]);
  nextHeldStep = performance.now() + STEP_DURATION;
}

function interact() {
  if (!state?.running) return;
  const station = nearbyStation(levelStations());
  if (!station) {
    setMessage("Aproxima-te de uma bancada para interagir.");
    return;
  }
  if (station.type === "reagent-bench" || station.type === "island-bench") {
    setMessage("Esta bancada está vazia. Procura os reagentes em movimento.");
  } else if (station.type === "moving-reagent" || station.type === "reagent-source") {
    if (state.carrying) {
      setMessage("Já tens um reagente. Leva-o ao reator primeiro.");
    } else {
      state.carrying = { recipe: levels[state.level].recipe, reagent: station.reagent, formula: station.label, processed: false };
      setMessage(`Recolheste ${station.label}. Leva-o à bancada Equação${levels[state.level].mode === "road" ? ", do outro lado da estrada" : ""}.`);
    }
  } else if (station.type === "delivery") {
    if (!state.carrying?.processed) {
      setMessage("Entrega aqui um resultado já preparado.");
    } else {
      const index = state.orders.findIndex(order => order.recipe === state.carrying.recipe);
      if (index === -1) {
        setMessage("Não há nenhum pedido ativo para este resultado.");
      } else {
        const recipe = recipeById(state.carrying.recipe);
        state.score += 100;
        state.deliveries++;
        state.carrying = null;
        state.orders.splice(index, 1);
        setMessage(`+100 pontos! ${recipe.fact}`);
        if (state.deliveries >= levels[state.level].goal) {
          render();
          finishLevel(true);
          return;
        }
        state.orders.push(newOrder());
      }
    }
  } else if (station.type === "reactor" && !station.item) {
    if (state.carrying?.reagent !== undefined) {
      state.reaction.collected[state.carrying.reagent] = true;
      state.carrying = null;
      setMessage(state.reaction.collected.every(Boolean)
        ? "Os reagentes estão prontos. Interage com a bancada para acertar a equação."
        : "Reagente entregue! Vai buscar os restantes às bancadas.");
    } else if (state.reaction.collected.every(Boolean) && !state.reaction.balanced) {
      openEquation();
    } else {
      setMessage("Recolhe todos os reagentes e leva-os à bancada Equação.");
    }
  } else if (station.item) {
    if (station.remaining > 0) {
      setMessage("A experiência ainda está a decorrer. Espera um pouco!");
    } else if (state.carrying) {
      setMessage("Precisas de ter as mãos vazias para recolher o resultado.");
    } else {
      state.carrying = station.item;
      delete station.item;
      delete station.remaining;
      setMessage(`${recipeById(state.carrying.recipe).result} pronto! Leva-o à entrega.`);
    }
  }
  render();
}

function openEquation() {
  state.running = false;
  state.status = "equation";
  heldDirections.clear();
  cancelAnimationFrame(animationId);
  equationFeedback.textContent = "";
  const recipe = recipeById(levels[state.level].recipe);
  const equation = equationForm.querySelector(".equation");
  equation.replaceChildren();
  [recipe.reactants, recipe.products].forEach((side, sideIndex) => {
    if (sideIndex) equation.append(document.createTextNode("→"));
    side.forEach((substance, index) => {
      if (index) equation.append(document.createTextNode("+"));
      const label = document.createElement("label");
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Coeficiente de ${substance.formula} ${sideIndex ? "nos produtos" : "nos reagentes"}`);
      for (let value = 1; value <= 12; value++) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
      }
      const formula = document.createElement("span");
      formula.textContent = substance.formula;
      label.append(select, formula);
      equation.append(label);
    });
  });
  document.querySelector("#equation-description").textContent = recipe.id === "rust"
    ? "Equação simplificada da corrosão do ferro. Escolhe os menores coeficientes inteiros para conservar os átomos."
    : "Escolhe os menores coeficientes inteiros para ter o mesmo número de átomos de cada elemento nos dois lados.";
  equationOverlay.hidden = false;
  equation.querySelector("select").focus();
}

function closeEquation() {
  equationOverlay.hidden = true;
  state.status = "running";
  state.running = true;
  lastFrame = 0;
  render();
  animationId = requestAnimationFrame(tick);
  document.querySelector("#help-button").focus();
}

equationForm.addEventListener("submit", event => {
  event.preventDefault();
  if (state?.status !== "equation") return;
  const recipe = recipeById(levels[state.level].recipe);
  const coefficients = Array.from(equationForm.querySelectorAll("select"), select => Number(select.value));
  const elements = new Set([...recipe.reactants, ...recipe.products].flatMap(substance => Object.keys(substance.atoms)));
  const countAtoms = (substances, offset, element) => substances.reduce((total, substance, index) =>
    total + coefficients[offset + index] * (substance.atoms[element] || 0), 0);
  const balanced = [...elements].every(element =>
    countAtoms(recipe.reactants, 0, element) === countAtoms(recipe.products, recipe.reactants.length, element));
  if (!balanced) {
    equationFeedback.textContent = `Ainda não está certa. Conta os átomos de ${[...elements].join(" e ")} em cada lado.`;
    return;
  }
  if (!coefficients.every((coefficient, index) => coefficient === recipe.coefficients[index])) {
    equationFeedback.textContent = "Os átomos estão equilibrados, mas usa os menores coeficientes inteiros.";
    return;
  }
  const reactor = stations.find(station => station.type === "reactor");
  state.reaction.balanced = true;
  reactor.item = { recipe: recipe.id, formula: recipe.products.map(product => product.formula).join("+"), processed: true };
  reactor.remaining = PROCESS_SECONDS;
  setMessage(`Equação certa! Espera e recolhe ${recipe.result.toLowerCase()} na bancada Equação.`);
  closeEquation();
});
document.querySelector("#equation-cancel").addEventListener("click", closeEquation);

function checkHazards() {
  if (state.robot && Math.abs(state.robot.x - state.visualX) < 0.55 && Math.abs(state.robot.y - state.visualY) < 0.55) {
    state.x = 1;
    state.y = 5;
    state.visualX = state.x;
    state.visualY = state.y;
    state.robot.x = 7;
    state.robot.y = 5;
    state.robot.moveIn = 0.8;
    state.walk = 0;
    state.movement = null;
    heldDirections.clear();
    state.remaining = Math.max(0, state.remaining - 8);
    setMessage("O robô apanhou-te! Perdeste 8 segundos, mas mantiveste o que levas.");
    return true;
  }
  const hazard = levelStations().find(station => station.type === "hazard"
    && Math.abs(station.x - state.visualX) < .7 && Math.abs(station.y - state.visualY) < .55);
  if (!hazard) return false;
  state.x = hazard.kind === "car" ? 1 : 4;
  state.y = hazard.kind === "car" ? state.roadSide : 4;
  state.visualX = state.x;
  state.visualY = state.y;
  state.walk = 0;
  state.movement = null;
  heldDirections.clear();
  state.remaining = Math.max(0, state.remaining - 8);
  setMessage(`${hazard.kind === "car" ? "Cuidado com os carros" : "Cuidado com o carrinho"}! Perdeste 8 segundos, mas mantiveste o que levas.`);
  return true;
}

function moveRobot() {
  const robot = state.robot;
  if (!robot) return false;
  const queue = [[robot.x, robot.y]];
  const previous = new Map([[`${robot.x},${robot.y}`, null]]);
  const steps = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let index = 0; index < queue.length; index++) {
    const [x, y] = queue[index];
    if (x === state.x && y === state.y) break;
    for (const [dx, dy] of steps) {
      const nextX = x + dx, nextY = y + dy;
      const key = `${nextX},${nextY}`;
      if (nextX < 0 || nextX > 8 || nextY < 0 || nextY > 6
        || mazeWalls.some(([wx, wy]) => wx === nextX && wy === nextY) 
        || levelStations().some(station => station.type !== "moving-reagent" && station.type !== "hazard" && station.x === nextX && station.y === nextY)
        || previous.has(key)) continue;
      previous.set(key, `${x},${y}`);
      queue.push([nextX, nextY]);
    }
  }
  let key = `${state.x},${state.y}`;
  if (!previous.has(key)) return false;
  while (previous.get(key) && previous.get(key) !== `${robot.x},${robot.y}`) key = previous.get(key);
  const [nextX, nextY] = key.split(",").map(Number);
  if (nextX === robot.x && nextY === robot.y) return false;
  robot.x = nextX;
  robot.y = nextY;
  return true;
}

function tick(timestamp) {
  if (!state.running) return;
  if (!lastFrame) lastFrame = timestamp;
  const elapsed = (timestamp - lastFrame) / 1000;
  lastFrame = timestamp;
  if (state.reaction) state.reaction.benchTime += elapsed;
  let robotMoved = false;
  if (state.robot) {
    state.robot.moveIn -= elapsed;
    if (state.robot.moveIn <= 0) {
      robotMoved = moveRobot();
      state.robot.moveIn += 0.62;
    }
  }
  let moving = updateMovement(timestamp);
  if (heldDirections.size && timestamp >= nextHeldStep) {
    const direction = Array.from(heldDirections.values()).at(-1);
    move(...directions[direction], timestamp);
    nextHeldStep = timestamp + STEP_DURATION;
    moving = true;
  }
  if (levels[state.level].mode === "road") {
    if (state.visualY <= 1.4) state.roadSide = 1;
    else if (state.visualY >= 3.6) state.roadSide = 5;
  }
  const hit = checkHazards();
  const previousSecond = Math.ceil(state.remaining);
  state.remaining = Math.max(0, state.remaining - elapsed);
  let changed = hit || Math.ceil(state.remaining) !== previousSecond;
  stations.forEach(station => {
    if (station.item && station.remaining > 0) {
      const previousProgress = Math.ceil(station.remaining);
      station.remaining = Math.max(0, station.remaining - elapsed);
      if (Math.ceil(station.remaining) !== previousProgress) changed = true;
    }
  });
  state.orders.forEach(order => {
    const previousOrderSecond = Math.ceil(order.remaining);
    order.remaining -= elapsed;
    if (Math.ceil(order.remaining) !== previousOrderSecond) changed = true;
  });
  for (let i = 0; i < state.orders.length; i++) {
    if (state.orders[i].remaining <= 0) {
      const expired = recipeById(state.orders[i].recipe);
      state.orders.splice(i, 1);
      state.orders.push(newOrder());
      setMessage(`O pedido de ${expired.name.toLowerCase()} expirou. Tenta novamente!`);
      changed = true;
      i--;
    }
  }
  if (changed) render();
  else if (moving || state.reaction || robotMoved) renderBoard();
  if (state.remaining <= 0) {
    finishLevel(false);
  } else {
    animationId = requestAnimationFrame(tick);
  }
}

function startGame(level = 0, baseScore = 0) {
  cancelAnimationFrame(animationId);
  resetGame(level, baseScore);
  overlay.hidden = true;
  lastFrame = 0;
  animationId = requestAnimationFrame(tick);
  document.querySelector("#help-button").focus();
}

function finishLevel(success) {
  state.running = false;
  heldDirections.clear();
  cancelAnimationFrame(animationId);
  state.status = success ? (state.level === levels.length - 1 ? "complete" : "won") : "failed";
  modalIcon.textContent = success ? "🎉" : "⏱";
  modalEyebrow.textContent = success ? "FASE CONCLUÍDA" : "TEMPO ESGOTADO";
  modalTitle.textContent = state.status === "complete" ? "Concluíste todas as fases!" : success ? "Experiência concluída!" : "Tenta outra vez!";
  modalDescription.textContent = success
    ? `${recipeById(levels[state.level].recipe).fact} Pontuação total: ${state.score}.`
    : `Completaste ${state.deliveries} de ${levels[state.level].goal} entregas. Repete a fase para avançar.`;
  modalControls.hidden = true;
  startButton.firstChild.textContent = state.status === "won" ? "PRÓXIMA FASE " : state.status === "failed" ? "REPETIR FASE " : "JOGAR OUTRA VEZ ";
  overlay.hidden = false;
  startButton.focus();
}

function showHelp() {
  if (!state?.running) return;
  state.running = false;
  state.status = "paused";
  heldDirections.clear();
  state.visualX = state.x;
  state.visualY = state.y;
  state.walk = 0;
  state.movement = null;
  renderBoard();
  cancelAnimationFrame(animationId);
  previousFocus = document.activeElement;
  modalIcon.textContent = "⚗";
  modalEyebrow.textContent = "PAUSA NO LABORATÓRIO";
  modalTitle.textContent = "Como jogar";
  modalDescription.textContent = levels[state.level].mode === "maze"
    ? "Recolhe os reagentes e leva-os à bancada Equação. O robô segue-te pelo labirinto; se te apanhar, perdes 8 segundos. Acerta a equação e entrega o resultado."
    : "Recolhe todos os reagentes e leva-os à bancada Equação. Evita os obstáculos: carros e carrinhos fazem-te perder 8 segundos. Acerta a equação e entrega o resultado. As reações são simulações.";
  modalControls.hidden = false;
  startButton.firstChild.textContent = "CONTINUAR ";
  overlay.hidden = false;
  startButton.focus();
}

startButton.addEventListener("click", () => {
  if (state?.status === "paused") {
    overlay.hidden = true;
    state.running = true;
    state.status = "running";
    lastFrame = 0;
    animationId = requestAnimationFrame(tick);
    previousFocus?.focus();
  } else if (state?.status === "won") {
    startGame(state.level + 1, state.score);
  } else if (state?.status === "failed") {
    startGame(state.level, state.baseScore);
  } else {
    startGame();
  }
});

fullscreenButton.addEventListener("click", async () => {
  fullscreenStatus.textContent = "";
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
      if (matchMedia("(pointer: coarse)").matches && screen.orientation?.lock) {
        try {
          await screen.orientation.lock("landscape");
          orientationLocked = true;
        } catch (error) {
          fullscreenStatus.textContent = "Roda o telemóvel para jogar na horizontal.";
          console.warn("Não foi possível fixar a orientação horizontal:", error);
        }
      }
    }
  } catch (error) {
    fullscreenStatus.textContent = "Não foi possível mudar para ecrã inteiro neste navegador.";
    console.error("Erro ao alterar o ecrã inteiro:", error);
  }
});
document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  if (!active && orientationLocked) {
    screen.orientation.unlock();
    orientationLocked = false;
  }
  fullscreenButton.setAttribute("aria-pressed", String(active));
  fullscreenButton.setAttribute("aria-label", active ? "Sair do ecrã inteiro" : "Entrar em ecrã inteiro");
  fullscreenButton.title = active ? "Sair do ecrã inteiro" : "Entrar em ecrã inteiro";
});
document.querySelector("#help-button").addEventListener("click", showHelp);
document.querySelector("#touch-action").addEventListener("click", interact);
board.addEventListener("pointerdown", event => {
  if (event.pointerType === "mouse" || !event.isPrimary) return;
  swipeStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  board.setPointerCapture(event.pointerId);
  event.preventDefault();
});
board.addEventListener("pointerup", event => {
  if (!swipeStart || event.pointerId !== swipeStart.pointerId) return;
  const deltaX = event.clientX - swipeStart.x;
  const deltaY = event.clientY - swipeStart.y;
  const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  swipeStart = null;
  if (distance < 24) return;
  const direction = Math.abs(deltaX) > Math.abs(deltaY)
    ? (deltaX > 0 ? "right" : "left")
    : (deltaY > 0 ? "down" : "up");
  move(...directions[direction]);
  event.preventDefault();
});
board.addEventListener("pointercancel", () => {
  swipeStart = null;
});
document.querySelectorAll("[data-move]").forEach(button => {
  button.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    startMoving(`pointer-${event.pointerId}`, button.dataset.move);
  });
  const release = event => heldDirections.delete(`pointer-${event.pointerId}`);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("click", event => {
    if (event.detail === 0) move(...directions[button.dataset.move]);
  });
});
document.addEventListener("keydown", event => {
  if (!state?.running) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (moveKeys[key]) {
    event.preventDefault();
    if (!event.repeat) startMoving(`key-${key}`, moveKeys[key]);
  } else if (key === " " || key === "e") {
    event.preventDefault();
    if (!event.repeat) interact();
  }
});
document.addEventListener("keyup", event => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  heldDirections.delete(`key-${key}`);
});
window.addEventListener("blur", () => heldDirections.clear());

startGame();
