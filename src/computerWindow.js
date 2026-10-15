import * as THREE from 'three';

/**
 * Screen mesh in monitor__computer__realistic_computer_monitor/scene.gltf.
 * It is a single quad (4 vertices) using the emissive material "Material.004",
 * and it fills the opening in the bezel mesh "Cube.001_Material.005_0".
 *
 * GLTFLoader sanitizes the node name, so the runtime object is
 * "Cube001_Material004_0" (the dots are removed).
 */
export const SCREEN_MESH_NAME = 'Cube.001_Material.004_0';
export const SCREEN_MESH_RUNTIME_NAME = 'Cube001_Material004_0';
export const SCREEN_MATERIAL_NAME = 'Material.004';

/** Reference canvas height. Font size, padding, and radius scale with this. */
const REFERENCE_HEIGHT = 1020;

export const defaultWindowOptions = {
  title: 'Notes',
  text: 'Project notes\n\nThis window is drawn on the monitor glass.\nChange the title, copy, colors, and size\nin src/main.js, then call update().',
  backgroundColor: '#f4f6f8',
  textColor: '#1c2430',
  titleColor: '#1c2430',
  titleBarColor: '#ffffff',
  desktopColor: '#07090d',
  fontSize: 42,
  fontFamily: 'Segoe UI, system-ui, sans-serif',
  textAlign: 'left',
  /** Window size as a fraction of the screen (0–1). */
  width: 0.88,
  height: 0.8,
  /**
   * Nudge the window on the screen, as a fraction of the screen.
   * Positive x moves right. Positive y moves up. 0, 0 is centered.
   */
  position: { x: 0, y: 0 },
  /** Rotation of the window on the screen, in degrees. */
  rotation: 0,
  visible: true,
  /**
   * When false, draw a dark, unlit screen (the computer is off).
   * The window chrome is not drawn in this mode.
   */
  poweredOn: true,
  /** Screen color used when poweredOn is false. */
  offColor: '#05070a',
  /**
   * Canvas pixel size. Height should match the screen aspect
   * (about 1.65:1 on this model) so the window is not stretched.
   */
  resolution: { width: 1680, height: 1020 },
  borderRadius: 28,
  padding: 48,
  borderColor: 'rgba(20, 24, 32, 0.14)',
  shadow: true,
  showControls: true,
};

/**
 * @param {THREE.Object3D} root
 * @returns {THREE.Mesh | null}
 */
export function findScreenMesh(root) {
  /** @type {THREE.Mesh[]} */
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });

  const named = meshes.find(
    (mesh) => mesh.name === SCREEN_MESH_NAME || mesh.name === SCREEN_MESH_RUNTIME_NAME,
  );
  if (named) return named;

  return (
    meshes.find((mesh) => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      return materials.some((material) => material?.name === SCREEN_MATERIAL_NAME);
    }) ?? null
  );
}

/**
 * World-space width / height of the screen quad.
 * Parent scales in this GLB are non-uniform, so local vertex distances are not the displayed aspect.
 * @param {THREE.Mesh} screenMesh
 */
export function measureScreenAspect(screenMesh) {
  const position = screenMesh.geometry.getAttribute('position');
  const corner = (index) =>
    new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(screenMesh.matrixWorld);

  const bottomRight = corner(0);
  const topRight = corner(1);
  const bottomLeft = corner(3);
  const width = bottomRight.distanceTo(bottomLeft);
  const height = bottomRight.distanceTo(topRight);
  return width / height;
}

/**
 * Draw an application window onto the monitor's screen mesh.
 * The canvas is a texture on that mesh, so it follows the model when it moves.
 *
 * @param {THREE.Mesh} screenMesh
 * @param {Partial<typeof defaultWindowOptions>} options
 */
export function createComputerWindow(screenMesh, options = {}) {
  const state = {
    ...defaultWindowOptions,
    ...options,
    position: { ...defaultWindowOptions.position, ...options.position },
    resolution: { ...defaultWindowOptions.resolution, ...options.resolution },
  };

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get a 2D canvas context for the computer window.');
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // This model's screen UVs put V=1 at the top of the display (the edge away from the stand).
  // flipY places the top of the canvas on that edge.
  texture.flipY = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;

  const originalMaterial = screenMesh.material;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false,
    side: THREE.FrontSide,
  });

  const api = {
    mesh: screenMesh,
    canvas,
    texture,
    material,
    update,
    setText,
    setTitle,
    setVisible,
    setPoweredOn,
    redraw,
    dispose,
  };

  screenMesh.userData.computerWindow = api;
  applyVisibility();
  redraw();
  return api;

  function update(patch = {}) {
    const { position, resolution, ...rest } = patch;
    Object.assign(state, rest);
    if (position) state.position = { ...state.position, ...position };
    if (resolution) state.resolution = { ...state.resolution, ...resolution };
    applyVisibility();
    redraw();
    return api;
  }

  function setText(text) {
    return update({ text });
  }

  function setTitle(title) {
    return update({ title });
  }

  function setVisible(visible) {
    return update({ visible });
  }

  function setPoweredOn(poweredOn) {
    return update({ poweredOn });
  }

  function applyVisibility() {
    screenMesh.material = state.visible ? material : originalMaterial;
  }

  function redraw() {
    const width = Math.max(2, Math.round(state.resolution.width));
    const height = Math.max(2, Math.round(state.resolution.height));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const scale = height / REFERENCE_HEIGHT;
    const ctx = context;
    ctx.clearRect(0, 0, width, height);

    if (!state.poweredOn) {
      ctx.fillStyle = state.offColor;
      ctx.fillRect(0, 0, width, height);
      texture.needsUpdate = true;
      return;
    }

    ctx.fillStyle = state.desktopColor;
    ctx.fillRect(0, 0, width, height);

    const windowWidth = clamp01(state.width) * width;
    const windowHeight = clamp01(state.height) * height;
    const centerX = width / 2 + state.position.x * width;
    const centerY = height / 2 - state.position.y * height;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((state.rotation * Math.PI) / 180);
    drawWindow(ctx, windowWidth, windowHeight, scale);
    ctx.restore();

    texture.needsUpdate = true;
  }

  function drawWindow(ctx, windowWidth, windowHeight, scale) {
    const radius = Math.min(state.borderRadius * scale, windowWidth / 2, windowHeight / 2);
    const padding = state.padding * scale;
    const fontSize = state.fontSize * scale;
    const titleSize = Math.max(18 * scale, fontSize * 0.78);
    const titleBarHeight = Math.max(titleSize + padding * 0.9, 56 * scale);

    ctx.save();
    if (state.shadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 36 * scale;
      ctx.shadowOffsetY = 16 * scale;
    }
    roundedRect(ctx, -windowWidth / 2, -windowHeight / 2, windowWidth, windowHeight, radius);
    ctx.fillStyle = state.backgroundColor;
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundedRect(ctx, -windowWidth / 2, -windowHeight / 2, windowWidth, windowHeight, radius);
    ctx.clip();

    ctx.fillStyle = state.titleBarColor;
    ctx.fillRect(-windowWidth / 2, -windowHeight / 2, windowWidth, titleBarHeight);

    ctx.strokeStyle = state.borderColor;
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.beginPath();
    ctx.moveTo(-windowWidth / 2, -windowHeight / 2 + titleBarHeight);
    ctx.lineTo(windowWidth / 2, -windowHeight / 2 + titleBarHeight);
    ctx.stroke();

    const controlSpace = state.showControls ? titleBarHeight * 2.15 : padding;
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      -windowWidth / 2,
      -windowHeight / 2,
      windowWidth - controlSpace,
      titleBarHeight,
    );
    ctx.clip();
    ctx.fillStyle = state.titleColor;
    ctx.font = `600 ${titleSize}px ${state.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.title, -windowWidth / 2 + padding, -windowHeight / 2 + titleBarHeight / 2);
    ctx.restore();

    if (state.showControls) {
      drawWindowControls(
        ctx,
        windowWidth / 2 - padding * 0.35,
        -windowHeight / 2 + titleBarHeight / 2,
        titleBarHeight,
        scale,
      );
    }

    const contentLeft = -windowWidth / 2 + padding;
    const contentTop = -windowHeight / 2 + titleBarHeight + padding * 0.85;
    const contentWidth = windowWidth - padding * 2;
    const contentBottom = windowHeight / 2 - padding * 0.7;

    ctx.save();
    ctx.beginPath();
    ctx.rect(contentLeft, contentTop, contentWidth, Math.max(0, contentBottom - contentTop));
    ctx.clip();

    ctx.fillStyle = state.textColor;
    ctx.font = `${fontSize}px ${state.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    const lines = wrapText(ctx, state.text, contentWidth);
    const lineHeight = fontSize * 1.4;
    lines.forEach((line, index) => {
      const y = contentTop + index * lineHeight;
      if (y > contentBottom) return;
      let x = contentLeft;
      if (state.textAlign === 'center') {
        x = -ctx.measureText(line).width / 2;
      } else if (state.textAlign === 'right') {
        x = windowWidth / 2 - padding - ctx.measureText(line).width;
      }
      ctx.fillText(line, x, y);
    });
    ctx.restore();

    roundedRect(ctx, -windowWidth / 2, -windowHeight / 2, windowWidth, windowHeight, radius);
    ctx.strokeStyle = state.borderColor;
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.stroke();
    ctx.restore();
  }

  function dispose() {
    screenMesh.material = originalMaterial;
    if (screenMesh.userData.computerWindow === api) {
      delete screenMesh.userData.computerWindow;
    }
    texture.dispose();
    material.dispose();
  }
}

/**
 * Find the screen mesh and create the window on it.
 * @param {THREE.Object3D} root
 * @param {Partial<typeof defaultWindowOptions>} options
 */
export function attachComputerWindow(root, options = {}) {
  const screenMesh = findScreenMesh(root);
  if (!screenMesh) {
    const names = [];
    root.traverse((object) => {
      if (object.isMesh) names.push(object.name || '(unnamed)');
    });
    throw new Error(
      `Could not find monitor screen mesh "${SCREEN_MESH_NAME}". Meshes in this model: ${names.join(', ')}`,
    );
  }

  root.updateWorldMatrix(true, true);
  const aspect = measureScreenAspect(screenMesh);
  const resolution = {
    width: options.resolution?.width ?? defaultWindowOptions.resolution.width,
    height:
      options.resolution?.height ??
      Math.round((options.resolution?.width ?? defaultWindowOptions.resolution.width) / aspect),
  };

  return createComputerWindow(screenMesh, { ...options, resolution });
}

function drawWindowControls(ctx, right, centerY, titleBarHeight, scale) {
  const glyph = titleBarHeight * 0.28;
  const gap = glyph * 2.15;
  ctx.save();
  ctx.strokeStyle = 'rgba(28, 36, 48, 0.55)';
  ctx.lineWidth = Math.max(1.25, 1.6 * scale);
  ctx.lineCap = 'round';

  const minimizeX = right - gap * 2;
  ctx.beginPath();
  ctx.moveTo(minimizeX - glyph * 0.45, centerY);
  ctx.lineTo(minimizeX + glyph * 0.45, centerY);
  ctx.stroke();

  const maximizeX = right - gap;
  const half = glyph * 0.42;
  ctx.strokeRect(maximizeX - half, centerY - half, half * 2, half * 2);

  const closeX = right;
  ctx.beginPath();
  ctx.moveTo(closeX - half, centerY - half);
  ctx.lineTo(closeX + half, centerY + half);
  ctx.moveTo(closeX + half, centerY - half);
  ctx.lineTo(closeX - half, centerY + half);
  ctx.stroke();
  ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text ?? '').split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }

    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) lines.push(line);

      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
        continue;
      }

      let chunk = '';
      for (const character of word) {
        const next = chunk + character;
        if (ctx.measureText(next).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk = next;
        }
      }
      line = chunk;
    }

    if (line) lines.push(line);
  }

  return lines;
}

function clamp01(value) {
  return Math.min(1, Math.max(0.05, Number(value) || 0));
}
