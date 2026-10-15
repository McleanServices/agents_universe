import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { attachComputerWindow } from './computerWindow.js';

const app = document.querySelector('#app');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1d24');

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.2, 0);

scene.add(new THREE.AmbientLight('#e4e9f2', 0.7));
scene.add(new THREE.HemisphereLight('#f7f8fb', '#3a3e47', 0.45));

const keyLight = new THREE.DirectionalLight('#ffffff', 2.6);
keyLight.position.set(3.5, 7, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight('#d5deee', 0.9);
fillLight.position.set(-5, 3, 5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight('#9eb4cc', 1.4);
rimLight.position.set(-2, 4, -5);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(12, 64),
  new THREE.MeshStandardMaterial({ color: '#181b21', roughness: 0.95, metalness: 0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const loader = new GLTFLoader();

/**
 * Edit this list to change what each of the 8 computers shows.
 * `name` is the label drawn under that monitor.
 * Set poweredOn: false to leave the screen dark (computer turned off).
 */
const COMPUTER_SCREENS = [
  {
    name: 'Jane',
    title: 'Notes',
    text: 'Project notes\n\nThis window is drawn on the monitor glass.\nChange the title, copy, and colors in src/main.js.',
    backgroundColor: '#f4f6f8',
    textColor: '#1c2430',
  },
  {
    name: 'Atlas',
    title: 'Terminal',
    text: '$ npm run dev\n\n  VITE ready in 412 ms\n  ➜ Local:   http://localhost:5173\n  ➜ press h to show help\n\n$ _',
    backgroundColor: '#0b1020',
    textColor: '#8affc1',
    titleBarColor: '#141a2e',
    titleColor: '#e6edff',
    fontFamily: 'Consolas, Menlo, monospace',
  },
  { name: 'Nova', poweredOn: false },
  {
    name: 'Miles',
    title: 'Mail',
    text: 'Inbox (3 unread)\n\n• Design review — 10:04\n• Lunch?       — 09:47\n• Deploy succeeded — 09:12',
    backgroundColor: '#ffffff',
    textColor: '#1c2430',
  },
  {
    name: 'Quinn',
    title: 'Chat',
    text: 'Alex: did you push the fix?\nYou: yep, on main\nAlex: 🎉\nYou: brb coffee',
    backgroundColor: '#eef3ff',
    textColor: '#1c2430',
  },
  { name: 'Orion', poweredOn: false },
  {
    name: 'Sage',
    title: 'Calendar',
    text: 'Today\n\n  10:00  Standup\n  11:30  1:1 with Sam\n   2:00  Design review\n   4:30  Focus block',
    backgroundColor: '#fff8ec',
    textColor: '#3a2a10',
  },
  {
    name: 'Rio',
    title: 'README.md',
    text: '# Hello, world\n\nEight monitors.\nEach draws its own canvas.\nSome are off.',
    backgroundColor: '#f4f6f8',
    textColor: '#1c2430',
    fontFamily: 'Consolas, Menlo, monospace',
  },
];

const GRID_COLUMNS = 4;
const GRID_ROWS = 2;
const SPACING_X = 1.15;

const computers = [];
let selectedIndex = -1;
let gridBounds = null;

const detail = document.querySelector('#detail');
const detailName = document.querySelector('#detail-name');
const detailStatus = document.querySelector('#detail-status');
const detailScreen = document.querySelector('#detail-screen');
const detailContext = detailScreen.getContext('2d');
const hint = document.querySelector('#hint');

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = null;

loader.load(
  '/scene.gltf',
  (gltf) => {
    // Normalize the loaded model so it sits at the origin, upright, with its
    // base on the ground, and measure it so we know how to space the clones.
    const template = new THREE.Group();
    template.add(gltf.scene);
    template.updateWorldMatrix(true, true);
    const templateBounds = new THREE.Box3().setFromObject(template);
    const templateCenter = templateBounds.getCenter(new THREE.Vector3());
    gltf.scene.position.set(-templateCenter.x, -templateBounds.min.y, -templateCenter.z);
    template.updateWorldMatrix(true, true);
    const monitorSize = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3());

    const stepX = monitorSize.x * SPACING_X;
    const originX = -((GRID_COLUMNS - 1) * stepX) / 2;
    const rowGap = monitorSize.y * 0.42;

    const monitors = [];
    const computerWindows = [];
    const anisotropy = renderer.capabilities.getMaxAnisotropy();

    for (let i = 0; i < GRID_COLUMNS * GRID_ROWS; i++) {
      const col = i % GRID_COLUMNS;
      const row = Math.floor(i / GRID_COLUMNS);

      const monitor = new THREE.Group();
      // Deep-clone the loaded scene so each monitor has its own meshes
      // (materials can stay shared; the screen material is replaced per clone).
      const sceneClone = gltf.scene.clone(true);
      sceneClone.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      monitor.add(sceneClone);
      // Spread horizontally across the row. Extra vertical gap leaves room
      // for the name under the upper monitors.
      monitor.position.set(
        originX + col * stepX,
        row === 0 ? 0 : monitorSize.y + rowGap,
        0,
      );
      scene.add(monitor);

      const screenConfig = COMPUTER_SCREENS[i] ?? {};
      const { name = `Computer ${i + 1}`, ...windowOptions } = screenConfig;
      const computerWindow = attachComputerWindow(monitor, {
        fontSize: 42,
        textAlign: 'left',
        width: 0.88,
        height: 0.8,
        ...windowOptions,
      });
      computerWindow.texture.anisotropy = anisotropy;

      const nameLabel = createNameLabel(name, monitorSize.x);
      // Hang the name just under the stand. The bottom row is lifted so the
      // label stays above the floor instead of being clipped by it.
      nameLabel.position.set(0, -nameLabel.scale.y * 0.2, monitorSize.z * 0.7);
      monitor.add(nameLabel);
      monitor.updateWorldMatrix(true, true);
      const labelWorldY = new THREE.Vector3();
      nameLabel.getWorldPosition(labelWorldY);
      const minLabelY = nameLabel.scale.y * 0.55;
      if (labelWorldY.y < minLabelY) {
        nameLabel.position.y += minLabelY - labelWorldY.y;
      }

      monitor.userData.computerIndex = computers.length;
      computers.push({
        monitor,
        computerWindow,
        name,
        poweredOn: windowOptions.poweredOn !== false,
        title: windowOptions.title ?? '',
      });
      monitors.push(monitor);
      computerWindows.push(computerWindow);
    }

    // Fit the camera to the whole grid of monitors.
    gridBounds = new THREE.Box3();
    monitors.forEach((monitor) => gridBounds.expandByObject(monitor));
    // Names hang past the monitor bodies. Pad the frame so the end labels
    // stay visible when the right-hand panel narrows the view.
    const framePad = monitorSize.x * 0.2;
    gridBounds.min.x -= framePad;
    gridBounds.max.x += framePad;
    const shelving = addShelving(monitorSize, stepX, monitorSize.y + rowGap);
    gridBounds.expandByObject(shelving);
    frameCameraToBounds(gridBounds);
    layoutView();

    window.monitors = monitors;
    window.computerWindows = computerWindows;
  },
  undefined,
  (error) => {
    console.error('Failed to load the computer model.', error);
  },
);

function addShelving(monitorSize, stepX, topRowY) {
  const width = (GRID_COLUMNS - 1) * stepX + monitorSize.x * 1.38;
  const depth = monitorSize.z * 1.15;
  const thickness = Math.max(monitorSize.y * 0.055, 0.02);
  const sideThickness = thickness * 1.4;
  // Keep the front lip behind the name labels, which sit in front of each stand.
  const z = -monitorSize.z * 0.08;

  const shelfMaterial = new THREE.MeshStandardMaterial({
    color: '#3a404c',
    roughness: 0.72,
    metalness: 0.04,
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: '#242833',
    roughness: 0.8,
    metalness: 0.04,
  });

  const unit = new THREE.Group();

  const addBox = (geometry, material, x, y, zPos) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, zPos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    unit.add(mesh);
    return mesh;
  };

  const shelfGeometry = new THREE.BoxGeometry(width, thickness, depth);
  addBox(shelfGeometry, shelfMaterial, 0, -thickness / 2, z);
  addBox(shelfGeometry, shelfMaterial, 0, topRowY - thickness / 2, z);

  const totalHeight = topRowY + thickness;
  const sideGeometry = new THREE.BoxGeometry(sideThickness, totalHeight, depth);
  const sideY = (topRowY - thickness) / 2;
  const sideX = width / 2 - sideThickness / 2;
  addBox(sideGeometry, sideMaterial, -sideX, sideY, z);
  addBox(sideGeometry, sideMaterial, sideX, sideY, z);

  const backHeight = topRowY - thickness;
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(width - sideThickness * 2, backHeight, thickness * 0.28),
    new THREE.MeshStandardMaterial({ color: '#1a1e27', roughness: 0.94, metalness: 0 }),
  );
  back.position.set(0, backHeight / 2, z - depth / 2 + thickness * 0.18);
  back.receiveShadow = true;
  unit.add(back);

  const wallHeight = monitorSize.y * 7;
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(monitorSize.x * 28, wallHeight),
    new THREE.MeshStandardMaterial({ color: '#161920', roughness: 1, metalness: 0 }),
  );
  wall.position.set(0, wallHeight / 2 - thickness, z - depth / 2 - monitorSize.z * 0.35);
  wall.receiveShadow = true;
  scene.add(wall);

  scene.add(unit);
  scene.background = new THREE.Color('#101216');

  floor.geometry.dispose();
  floor.geometry = new THREE.PlaneGeometry(monitorSize.x * 36, monitorSize.x * 36);
  floor.position.y = -thickness;
  floor.material.color.set('#12141a');
  floor.material.roughness = 0.95;

  return unit;
}

function createNameLabel(name, monitorWidth) {
  const width = 512;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  context.font = '600 78px Segoe UI, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(0, 0, 0, 0.85)';
  context.shadowBlur = 16;
  context.shadowOffsetY = 4;
  context.fillStyle = '#f4f7fb';
  context.fillText(name, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const labelWidth = monitorWidth * 0.72;
  sprite.scale.set(labelWidth, labelWidth * (height / width), 1);
  sprite.userData.name = name;
  return sprite;
}

function frameCameraToBounds(bounds) {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  const fovY = (camera.fov * Math.PI) / 180;
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * camera.aspect);
  // Distance needed so both the full width and the full height fit in view.
  const distance = Math.max(
    size.y / (2 * Math.tan(fovY / 2)),
    size.x / (2 * Math.tan(fovX / 2)),
  ) * 1.28;

  camera.position.set(center.x, center.y, center.z + distance);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 40;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
  controls.target.copy(center);
  // A click can leave a small orbit delta. Clear it so framing stays put.
  controls._sphericalDelta.set(0, 0, 0);
  controls._panOffset.set(0, 0, 0);
  controls._scale = 1;
  controls.update();

  const shadowSize = Math.max(size.x, size.y, size.z);
  keyLight.shadow.camera.left = -shadowSize;
  keyLight.shadow.camera.right = shadowSize;
  keyLight.shadow.camera.top = shadowSize;
  keyLight.shadow.camera.bottom = -shadowSize;
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = shadowSize * 8;
  keyLight.shadow.camera.updateProjectionMatrix();
}

function viewWidth() {
  if (!detail.classList.contains('open')) return window.innerWidth;
  return Math.max(240, window.innerWidth - detail.getBoundingClientRect().width);
}

function layoutView() {
  const width = viewWidth();
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  if (gridBounds) frameCameraToBounds(gridBounds);
}

function selectComputer(index) {
  selectedIndex = index;
  computers.forEach((computer, i) => {
    computer.monitor.position.z = i === index ? 0.28 : 0;
  });

  if (index < 0) {
    detail.classList.remove('open');
    detail.setAttribute('aria-hidden', 'true');
    hint.hidden = false;
    layoutView();
    return;
  }

  const computer = computers[index];
  detailName.textContent = computer.name;
  detailStatus.textContent = computer.poweredOn ? '' : 'This computer is turned off.';
  const source = computer.computerWindow.canvas;
  detailScreen.width = source.width;
  detailScreen.height = source.height;
  detailContext.drawImage(source, 0, 0);

  detail.classList.add('open');
  detail.setAttribute('aria-hidden', 'false');
  hint.hidden = true;
  layoutView();
}

function computerIndexAt(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(
    computers.map((computer) => computer.monitor),
    true,
  );
  if (hits.length === 0) return -1;

  let object = hits[0].object;
  while (object) {
    if (object.userData.computerIndex != null) return object.userData.computerIndex;
    object = object.parent;
  }
  return -1;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY };
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerDown || computers.length === 0) return;
  const dx = event.clientX - pointerDown.x;
  const dy = event.clientY - pointerDown.y;
  pointerDown = null;
  if (dx * dx + dy * dy > 16) return;

  const index = computerIndexAt(event);
  selectComputer(index);
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (computers.length === 0) return;
  renderer.domElement.style.cursor = computerIndexAt(event) >= 0 ? 'pointer' : '';
});

document.querySelector('#detail-close').addEventListener('click', () => {
  selectComputer(-1);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') selectComputer(-1);
});

window.addEventListener('resize', () => {
  layoutView();
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
