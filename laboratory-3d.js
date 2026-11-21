"use strict";

function stationIsNearby(station, state) {
  const distance = Math.abs(station.x - state.x) + Math.abs(station.y - state.y);
  return station.type === "moving-reagent" ? distance <= 1.5 : distance === 1;
}

const laboratory3dRenderer = (() => {
  const T = window.THREE;
  if (!T) throw new Error("Three.js não foi carregado. Verifica o ficheiro local vendor/three.min.js.");

  const scene = new T.Scene();
  scene.background = new T.Color("#e7f0e2");
  const camera = new T.OrthographicCamera(-6.2, 6.2, 4.1, -4.1, 0.1, 100);
  camera.position.set(6, 8, 6);
  camera.lookAt(0, 0.15, 0);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");

  const hemisphere = new T.HemisphereLight("#fff8e9", "#6a8878", 2.15);
  scene.add(hemisphere);
  const sunlight = new T.DirectionalLight("#fff2d6", 3);
  sunlight.position.set(-6, 12, 8);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = -10;
  sunlight.shadow.camera.right = 10;
  sunlight.shadow.camera.top = 10;
  sunlight.shadow.camera.bottom = -10;
  sunlight.shadow.bias = -0.00025;
  sunlight.shadow.radius = 4;
  scene.add(sunlight);

  const worldGroup = new T.Group();
  const stationsGroup = new T.Group();
  const movingGroup = new T.Group();
  scene.add(worldGroup, stationsGroup, movingGroup);

  const geometryCache = new Map();
  const materialCache = new Map();
  const badgeCache = new Map();
  const reagentColors = ["#79bfd3", "#e7a36f", "#a98bcb"];
  let boardElement;
  let currentLevel = -1;
  let stationSignature = "";

  function geometry(key, create) {
    if (!geometryCache.has(key)) geometryCache.set(key, create());
    return geometryCache.get(key);
  }

  function material(color, options = {}) {
    const key = `${color}:${JSON.stringify(options)}`;
    if (!materialCache.has(key)) {
      materialCache.set(key, new T.MeshStandardMaterial({
        color,
        roughness: 0.76,
        metalness: 0.02,
        ...options
      }));
    }
    return materialCache.get(key);
  }

  function boxGeometry(width, height, depth) {
    const key = `box:${width}:${height}:${depth}`;
    return geometry(key, () => new T.BoxGeometry(width, height, depth));
  }

  function worldPoint(x, y, height = 0) {
    return new T.Vector3(x - 4.5, height, y - 3.5);
  }

  function addMesh(parent, meshGeometry, meshMaterial, position, castShadow = true) {
    const mesh = new T.Mesh(meshGeometry, meshMaterial);
    mesh.position.copy(position);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addGridBox(parent, x, y, bottom, width, height, depth, color, options) {
    return addMesh(
      parent,
      boxGeometry(width, height, depth),
      material(color, options),
      worldPoint(x + width / 2, y + depth / 2, bottom + height / 2)
    );
  }

  function addLocalBox(parent, x, height, z, width, boxHeight, depth, color, options) {
    return addMesh(
      parent,
      boxGeometry(width, boxHeight, depth),
      color?.isMaterial ? color : material(color, options),
      new T.Vector3(x, height, z)
    );
  }

  function addCylinder(parent, x, y, bottom, radiusTop, radiusBottom, height, color, options = {}) {
    const segments = options.segments || 20;
    const key = `cylinder:${radiusTop}:${radiusBottom}:${height}:${segments}`;
    const cylinderMaterial = { ...options };
    delete cylinderMaterial.segments;
    return addMesh(
      parent,
      geometry(key, () => new T.CylinderGeometry(radiusTop, radiusBottom, height, segments)),
      material(color, cylinderMaterial),
      worldPoint(x, y, bottom + height / 2)
    );
  }

  function addLocalCylinder(parent, x, height, z, radius, depth, color) {
    const key = `wheel:${radius}:${depth}`;
    const mesh = addMesh(
      parent,
      geometry(key, () => new T.CylinderGeometry(radius, radius, depth, 14)),
      material(color),
      new T.Vector3(x, height, z)
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  function badge(text, highlighted) {
    const key = `${text}:${highlighted}`;
    if (badgeCache.has(key)) return badgeCache.get(key);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = "700 22px system-ui, sans-serif";
    const width = Math.ceil(context.measureText(text).width + 30);
    canvas.width = width;
    canvas.height = 64;
    context.font = "700 22px system-ui, sans-serif";
    context.fillStyle = highlighted ? "#f5c670" : "rgba(255, 255, 246, .97)";
    context.beginPath();
    context.roundRect(1, 1, width - 2, 62, 16);
    context.fill();
    context.fillStyle = "#30584a";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, width / 2, 33);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    }));
    const height = 0.60;
    sprite.scale.set(width / canvas.height * height, height, 1);
    badgeCache.set(key, sprite);
    return sprite;
  }

  function badgeSprite(text, highlighted) {
    const template = badge(text, highlighted);
    const sprite = new T.Sprite(template.material);
    sprite.scale.copy(template.scale);
    return sprite;
  }

  function addBadge(parent, text, x, y, height, highlighted) {
    const sprite = badgeSprite(text, highlighted);
    if (text === "EQUAÇÃO" || text === "ENTREGAR") {
      sprite.scale.multiplyScalar(0.72);
    }
    sprite.position.copy(worldPoint(x, y, height));
    parent.add(sprite);
  }

  function clearGroup(group) {
    while (group.children.length) group.remove(group.children[group.children.length - 1]);
  }

  function buildWorld(level, walls) {
    clearGroup(worldGroup);
    addGridBox(worldGroup, -0.12, -0.12, -0.34, 9.24, 0.34, 7.24, "#527e6a");

    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 9; x++) {
        const road = level === 1 && (y === 2 || y === 3);
        const color = road ? "#5d6e70" : (x + y) % 2 ? "#d9ead4" : "#cde2cc";
        addGridBox(worldGroup, x + 0.01, y + 0.01, 0, 0.98, 0.035, 0.98, color, { roughness: 0.92 });
      }
    }

    if (level === 1) {
      for (let x = 0; x < 9; x++) {
        addGridBox(worldGroup, x + 0.18, 2.46, 0.037, 0.64, 0.012, 0.08, "#f1cf78", { roughness: 0.8 });
        addGridBox(worldGroup, x + 0.18, 3.46, 0.037, 0.64, 0.012, 0.08, "#f1cf78", { roughness: 0.8 });
      }
    }

    if (level === 2) {
      walls.forEach(([x, y]) => {
        addGridBox(worldGroup, x + 0.10, y + 0.10, 0.035, 0.80, 0.20, 0.80, "#91aaa0");
        addGridBox(worldGroup, x + 0.08, y + 0.08, 0.235, 0.84, 0.055, 0.84, "#d6e4de");
        addGridBox(worldGroup, x + 0.42, y + 0.42, 0.290, 0.16, 0.035, 0.16, "#eef4ef");
      });
    }
    currentLevel = level;
  }

  function reagentVial(parent, x, y, bottom, color) {
    addCylinder(parent, x, y, bottom, 0.19, 0.22, 0.32, "#cdebf0", {
      transparent: true,
      opacity: 0.58,
      roughness: 0.18
    });
    addCylinder(parent, x, y, bottom + 0.03, 0.15, 0.17, 0.13, color, { roughness: 0.35 });
    addCylinder(parent, x, y, bottom + 0.32, 0.095, 0.095, 0.13, "#e5f3ed", { roughness: 0.32 });
    addCylinder(parent, x, y, bottom + 0.44, 0.12, 0.12, 0.07, color, { roughness: 0.45 });
  }

  function baseColors(station) {
    if (station.type === "delivery") return ["#bc8157", "#f2d89e"];
    if (station.type === "reactor" || station.type === "bin") return ["#719b91", "#d4e8d9"];
    if (station.type === "heat") return ["#bc795b", "#f5d29a"];
    if (station.type === "filter") return ["#7394a3", "#d8e9e9"];
    if (station.type === "magnet") return ["#b66a62", "#f0d7c8"];
    return ["#a9825e", "#f5e5c4"];
  }

  function createObstacle(parent, station) {
    if (station.kind === "barrel") {
      addCylinder(parent, station.x + 0.5, station.y + 0.5, 0.04, 0.32, 0.32, 0.76, "#c87563");
      addCylinder(parent, station.x + 0.5, station.y + 0.5, 0.8, 0.32, 0.32, 0.06, "#edb4a1");
    } else {
      const size = station.kind === "rack" ? 0.76 : 0.58;
      const height = station.kind === "rack" ? 1.12 : 0.64;
      addGridBox(parent, station.x + (1 - size) / 2, station.y + (1 - size) / 2, 0.04,
        size, height, size, station.kind === "rack" ? "#7895a0" : "#b88a62");
      if (station.kind === "rack") {
        addGridBox(parent, station.x + 0.15, station.y + 0.17, 0.34, 0.70, 0.055, 0.66, "#d5e5e3");
        addGridBox(parent, station.x + 0.15, station.y + 0.17, 0.70, 0.70, 0.055, 0.66, "#d5e5e3");
      }
    }
  }

  function createStation(parent, station, state) {
    if (station.type === "obstacle") {
      createObstacle(parent, station);
      return;
    }

    const joined = station.type === "reagent-bench" || station.island;
    const offset = joined ? 0 : 0.08;
    const size = joined ? 1 : 0.84;
    const [baseColor, topColor] = baseColors(station);
    addGridBox(parent, station.x + offset, station.y + offset, 0.025, size, 0.60, size, baseColor);
    addGridBox(parent, station.x + (joined ? 0 : 0.035), station.y + (joined ? 0 : 0.035), 0.625,
      joined ? 1 : 0.77, 0.10, joined ? 1 : 0.77, topColor, { roughness: 0.48 });
    if (station.belt) {
      addGridBox(parent, station.x + 0.06, station.y + 0.22, 0.73, 0.88, 0.025, 0.56, "#52766b");
    }
    if (station.type === "reagent-bench" || station.type === "island-bench") return;

    const centerX = station.x + 0.5;
    const centerY = station.y + 0.5;
    const equipmentBottom = 0.74;
    if (station.type === "source" || station.type === "reagent-source") {
      const color = reagentColors[station.reagent ?? 0];
      reagentVial(parent, centerX, centerY, equipmentBottom, color);
    } else if (station.type === "reactor") {
      addCylinder(parent, centerX, centerY, equipmentBottom, 0.23, 0.28, 0.30, "#bddde0", {
        transparent: true,
        opacity: 0.6,
        roughness: 0.2
      });
      addCylinder(parent, centerX, centerY, equipmentBottom + 0.04, 0.19, 0.22, 0.12, "#81c6b5", { roughness: 0.38 });
      addCylinder(parent, centerX, centerY, equipmentBottom + 0.30, 0.15, 0.15, 0.06, "#e7f3e9", { roughness: 0.3 });
      if (station.item) {
        const product = station.remaining > 0 ? "#e5a159" : "#6eaf7f";
        addCylinder(parent, centerX, centerY, equipmentBottom + 0.38, 0.10, 0.12, 0.15, product);
      }
    } else if (station.type === "heat") {
      addCylinder(parent, centerX, centerY, equipmentBottom, 0.20, 0.24, 0.10, "#667a7b");
      addCylinder(parent, centerX, centerY, equipmentBottom + 0.10, 0.14, 0.17, 0.16, "#ef9865");
    } else if (station.type === "filter") {
      const funnel = addMesh(parent, geometry("filter-cone", () => new T.ConeGeometry(0.23, 0.35, 20)),
        material("#a9c7d7", { roughness: 0.35 }), worldPoint(centerX, centerY, equipmentBottom + 0.18));
      funnel.rotation.x = Math.PI;
      addCylinder(parent, centerX, centerY, equipmentBottom - 0.02, 0.06, 0.08, 0.20, "#769fb3");
    } else if (station.type === "magnet") {
      addGridBox(parent, centerX - 0.20, centerY - 0.12, equipmentBottom, 0.40, 0.12, 0.24, "#df7f70");
      addGridBox(parent, centerX - 0.20, centerY - 0.12, equipmentBottom + 0.12, 0.10, 0.22, 0.24, "#ecf2e7");
      addGridBox(parent, centerX + 0.10, centerY - 0.12, equipmentBottom + 0.12, 0.10, 0.22, 0.24, "#ecf2e7");
    } else if (station.type === "delivery") {
      addGridBox(parent, centerX - 0.17, centerY - 0.16, equipmentBottom, 0.34, 0.22, 0.32, "#dcad6d");
    } else if (station.type === "bin") {
      addGridBox(parent, centerX - 0.20, centerY - 0.16, equipmentBottom, 0.40, 0.25, 0.32, "#799e8e");
    }

    if (station.label && station.type !== "island-bench") {
      const label = station.item ? (station.remaining > 0 ? "A PROCESSAR" : "PRONTO!")
        : station.reagent !== undefined ? station.label : station.label.toUpperCase();
      const labelX = centerX + (station.type === "delivery" ? 0.18 : station.type === "reactor" ? -0.18 : 0);
      const labelY = centerY + (station.type === "delivery" ? 0.92 : station.type === "reactor" ? -0.92 : 0);
      addBadge(parent, label, labelX, labelY, 1.95, stationIsNearby(station, state));
    }
  }

  function staticStationsKey(stations, state) {
    const stableStations = stations.filter(station => station.type !== "hazard" && station.type !== "moving-reagent");
    return JSON.stringify([state.level, stableStations.map(station => [
      station.type, station.x, station.y, station.kind, station.label, station.reagent, station.island, station.belt,
      station.item?.recipe, station.item ? station.remaining > 0 : false,
      stationIsNearby(station, state)
    ])]);
  }

  function updateStaticStations(stations, state) {
    const key = staticStationsKey(stations, state);
    if (key === stationSignature) return;
    clearGroup(stationsGroup);
    stations.filter(station => station.type !== "hazard" && station.type !== "moving-reagent")
      .forEach(station => createStation(stationsGroup, station, state));
    stationSignature = key;
  }

  function movingReagent(parent, station, state) {
    const color = reagentColors[station.reagent ?? 0];
    reagentVial(parent, station.x + 0.5, station.y + 0.5, 0.75, color);
    addBadge(parent, station.label, station.x + 0.5, station.y + 0.5, 1.8,
      stationIsNearby(station, state));
  }

  function car(parent, station) {
    const group = new T.Group();
    group.position.copy(worldPoint(station.x + 0.5, station.y + 0.5, 0));
    const palette = station.y === 2
      ? { body: "#ca6150", roof: "#ef9880", glass: "#b9dbe0" }
      : { body: "#608da7", roof: "#9dc7d4", glass: "#d2e8e9" };
    addLocalBox(group, 0, 0.22, 0, 0.92, 0.30, 0.68, palette.body);
    addLocalBox(group, 0, 0.47, 0, 0.48, 0.25, 0.48, palette.roof);
    addLocalBox(group, 0, 0.47, 0.245, 0.38, 0.16, 0.018, palette.glass, { roughness: 0.28 });
    for (const x of [-0.29, 0.29]) {
      for (const z of [-0.34, 0.34]) addLocalCylinder(group, x, 0.13, z, 0.13, 0.09, "#293f42");
    }
    addLocalBox(group, 0.45, 0.22, 0.19, 0.06, 0.07, 0.11, "#fff0b3", { emissive: "#f5c670" });
    parent.add(group);
  }

  function cart(parent, station) {
    const group = new T.Group();
    group.position.copy(worldPoint(station.x + 0.5, station.y + 0.5, 0));
    addLocalBox(group, 0, 0.34, 0, 0.68, 0.55, 0.56, "#d48c45");
    addLocalBox(group, 0, 0.64, 0, 0.78, 0.08, 0.66, "#f5be73");
    for (const x of [-0.24, 0.24]) addLocalCylinder(group, x, 0.13, 0.28, 0.12, 0.08, "#293f42");
    parent.add(group);
  }

  function player(parent, state) {
    const group = new T.Group();
    group.position.copy(worldPoint((state.visualX ?? state.x) + 0.5, (state.visualY ?? state.y) + 0.5, 0));
    const stride = state.walk || 0;
    const coat = material("#f9faf0");
    const dark = material("#375e5a");
    const skin = material("#e5ae82");
    for (const side of [-1, 1]) {
      const legSwing = stride * side * 0.34;
      const leg = addLocalBox(group, side * 0.11, 0.16, side * stride * 0.08, 0.13, 0.31, 0.14, dark);
      leg.position.y = 0.16;
      leg.rotation.x = legSwing;
    }
    addLocalBox(group, 0, 0.58, 0, 0.42, 0.48, 0.28, coat);
    addLocalBox(group, -0.27, 0.54 - stride * 0.08, stride * 0.11, 0.10, 0.34, 0.14, coat);
    addLocalBox(group, 0.27, 0.54 + stride * 0.08, -stride * 0.11, 0.10, 0.34, 0.14, coat);
    addMesh(group, geometry("player-head", () => new T.SphereGeometry(0.17, 18, 14)),
      skin, new T.Vector3(0, 0.94, 0.01));
    addLocalBox(group, 0, 1.10, 0, 0.39, 0.08, 0.32, "#566a55");
    addLocalBox(group, 0, 1.16, 0, 0.45, 0.07, 0.38, coat);
    addLocalBox(group, -0.06, 0.96, 0.15, 0.035, 0.04, 0.025, "#304a43");
    addLocalBox(group, 0.06, 0.96, 0.15, 0.035, 0.04, 0.025, "#304a43");
    if (state.carrying) {
      const formulaColor = reagentColors[state.carrying.reagent ?? 0];
      addLocalBox(group, 0.35, 0.60, 0.10, 0.18, 0.22, 0.18, formulaColor);
      const carried = badgeSprite(state.carrying.formula, false);
      carried.position.set(0.35, 0.86, 0.10);
      group.add(carried);
    }
    parent.add(group);
  }

  function robot(parent, state) {
    const group = new T.Group();
    group.position.copy(worldPoint(state.robot.x + 0.5, state.robot.y + 0.5, 0));
    addLocalBox(group, -0.13, 0.16, 0, 0.15, 0.28, 0.16, "#293f42");
    addLocalBox(group, 0.13, 0.16, 0, 0.15, 0.28, 0.16, "#293f42");
    addLocalBox(group, 0, 0.51, 0, 0.48, 0.46, 0.34, "#d46d55");
    addLocalBox(group, 0, 0.85, 0, 0.42, 0.28, 0.34, "#8da9a7");
    addLocalBox(group, -0.09, 0.88, 0.18, 0.07, 0.06, 0.035, "#f4c66e", { emissive: "#f4c66e" });
    addLocalBox(group, 0.09, 0.88, 0.18, 0.07, 0.06, 0.035, "#f4c66e", { emissive: "#f4c66e" });
    addLocalCylinder(group, 0, 1.14, 0, 0.035, 0.035, 0.23, "#557566");
    addMesh(group, geometry("robot-antenna", () => new T.SphereGeometry(0.10, 12, 10)),
      material("#f4c66e", { emissive: "#f4c66e" }), new T.Vector3(0, 1.30, 0));
    parent.add(group);
  }

  function updateMoving(stations, state, processSeconds) {
    clearGroup(movingGroup);
    stations.forEach(station => {
      if (station.type === "moving-reagent") movingReagent(movingGroup, station, state);
      if (station.type === "hazard" && station.kind === "car") car(movingGroup, station);
      if (station.type === "hazard" && station.kind !== "car") cart(movingGroup, station);
    });
    player(movingGroup, state);
    if (state.robot) robot(movingGroup, state);

    stations.filter(station => station.item).forEach(station => {
      const progress = station.remaining > 0 ? 1 - station.remaining / processSeconds : 1;
      addGridBox(movingGroup, station.x + 0.25, station.y + 0.11, 0.82, 0.50, 0.035, 0.09,
        "#d9e7d4", { emissive: "#d9e7d4" });
      if (progress > 0) {
        addGridBox(movingGroup, station.x + 0.25, station.y + 0.11, 0.84, 0.50 * progress, 0.04, 0.09,
          station.remaining > 0 ? "#e5a159" : "#6eaf7f",
          { emissive: station.remaining > 0 ? "#e5a159" : "#6eaf7f" });
      }
    });
  }

  function resize() {
    if (!boardElement) return;
    const width = boardElement.clientWidth;
    const height = boardElement.clientHeight;
    if (!width || !height) return;
    const viewWidth = 15.2;
    const viewHeight = viewWidth / (width / height);
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  const observer = new ResizeObserver(resize);

  return function renderLaboratory(board, stations, state, processSeconds, mazeWalls = []) {
    if (!boardElement) {
      boardElement = board;
      boardElement.replaceChildren(renderer.domElement);
      observer.observe(boardElement);
      resize();
    }
    if (state.level !== currentLevel) buildWorld(state.level, mazeWalls);
    updateStaticStations(stations, state);
    updateMoving(stations, state, processSeconds);
    renderer.render(scene, camera);
  };
})();

function renderLaboratory(board, stations, state, processSeconds, mazeWalls = []) {
  laboratory3dRenderer(board, stations, state, processSeconds, mazeWalls);
}
