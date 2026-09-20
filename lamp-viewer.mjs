import * as THREE from './three.module.min.js';

/**
 * A self-contained, transparent-background studio for the VELORA lamp collection.
 * rotateBy() accepts radians; brightness accepts a number between 0 and 100.
 * The caller owns the canvas's CSS dimensions and the accessible controls.
 */
export function createLampViewer(canvas, { onReady, onError, reducedMotion } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    onError?.(new Error('A canvas is required to display this lamp.'));
    return null;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error('3D is unavailable in this browser.'));
    return null;
  }

  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const followsMotionPreference = typeof reducedMotion !== 'boolean';
  let reduceMotion = followsMotionPreference ? Boolean(motionQuery?.matches) : reducedMotion;
  let disposed = false;
  let contextLost = false;
  let inView = true;
  let frame = 0;
  let lastTime = 0;
  let ready = false;
  let paused = false;
  let currentModel = 'mora';
  let currentFinish = 'chalk';
  let targetBrightness = 72;
  let brightness = targetBrightness;
  let targetYaw = -0.35;
  let yaw = targetYaw;
  let targetPitch = 0.025;
  let pitch = targetPitch;
  let drag = null;
  let dragging = false;
  let width = 0;
  let height = 0;
  let pixelRatio = 0;

  const oldCursor = canvas.style.cursor;
  const oldTouchAction = canvas.style.touchAction;
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'pan-y';

  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 35);
  const cameraTarget = new THREE.Vector3(0, 1.43, 0);
  const lamp = new THREE.Group();
  scene.add(lamp);

  const finishColors = {
    chalk: new THREE.Color('#e6ddd0'),
    ember: new THREE.Color('#b24d31'),
    ink: new THREE.Color('#303b39'),
  };
  const finishTarget = finishColors.chalk.clone();
  const ceramic = new THREE.MeshPhysicalMaterial({
    color: finishColors.chalk,
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.10,
    clearcoatRoughness: 0.55,
  });
  const diffuser = new THREE.MeshStandardMaterial({
    color: '#ffdfac',
    emissive: '#ffbf6f',
    emissiveIntensity: 1,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const brass = new THREE.MeshStandardMaterial({ color: '#82705b', roughness: 0.40, metalness: 0.65 });
  const cordMaterial = new THREE.MeshStandardMaterial({ color: '#26302c', roughness: 0.9 });

  scene.add(new THREE.HemisphereLight('#e8f0e7', '#5c7669', 1.9));
  const key = new THREE.DirectionalLight('#fff1dc', 3.3);
  key.position.set(-3.5, 5.5, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3.5;
  key.shadow.camera.right = 3.5;
  key.shadow.camera.top = 4.5;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 15;
  key.shadow.normalBias = 0.025;
  key.shadow.bias = -0.0003;
  key.shadow.radius = 4;
  key.target.position.set(0, 1.2, 0);
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight('#cfede3', 0.85);
  fill.position.set(4.5, 2.1, 3.4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#ffdbb8', 2.25);
  rim.position.set(1.7, 4.2, -3);
  scene.add(rim);

  const bulb = new THREE.PointLight('#ffbd74', 4, 4.8, 2);
  // The bulb light is attached to the rotating product, just below its diffuser.
  lamp.add(bulb);

  const shadowMaterial = new THREE.ShadowMaterial({ color: '#000b08', opacity: 0.10 });
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), shadowMaterial);
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = -0.012;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  // A small generated radial texture adds a soft contact shadow without assets.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  let contactTexture = null;
  let contactShadow = null;
  if (shadowContext) {
    const gradient = shadowContext.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0, 9, 6, 0.48)');
    gradient.addColorStop(0.27, 'rgba(0, 9, 6, 0.28)');
    gradient.addColorStop(0.68, 'rgba(0, 9, 6, 0.09)');
    gradient.addColorStop(1, 'rgba(0, 9, 6, 0)');
    shadowContext.fillStyle = gradient;
    shadowContext.fillRect(0, 0, 128, 128);
    contactTexture = new THREE.CanvasTexture(shadowCanvas);
    contactTexture.colorSpace = THREE.SRGBColorSpace;
    contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.8),
      new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, opacity: 0.68 }),
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = -0.004;
    scene.add(contactShadow);
  }

  function mesh(geometry, material = ceramic, parent = lamp) {
    const result = new THREE.Mesh(geometry, material);
    result.castShadow = material !== diffuser;
    result.receiveShadow = material !== diffuser;
    parent.add(result);
    return result;
  }

  function lathe(profile, material = ceramic, parent = lamp, segments = 112) {
    return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments), material, parent);
  }

  function plinth(radius = 0.46) {
    return lathe([
      [0, 0.015], [radius * 0.89, 0.015], [radius * 0.97, 0.027],
      [radius, 0.058], [radius, 0.101], [radius * 0.97, 0.132],
      [radius * 0.88, 0.153], [0, 0.153],
    ]);
  }

  function addCord(baseRadius) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.055, -baseRadius * 0.90),
      new THREE.Vector3(0.045, 0.033, -baseRadius - 0.18),
      new THREE.Vector3(0.26, 0.021, -baseRadius - 0.37),
      new THREE.Vector3(0.58, 0.020, -baseRadius - 0.47),
      new THREE.Vector3(0.85, 0.020, -baseRadius - 0.69),
    ]);
    mesh(new THREE.TubeGeometry(curve, 36, 0.014, 8, false), cordMaterial);
  }

  function buildMora() {
    plinth(0.47);
    lathe([
      [0, 0.12], [0.245, 0.12], [0.268, 0.19], [0.280, 0.34],
      [0.273, 0.55], [0.250, 0.78], [0.215, 1.00],
      [0.178, 1.19], [0.151, 1.375], [0, 1.375],
    ]);
    // A broad, low mushroom cap with a rolled rim and a warm recessed diffuser.
    lathe([
      [0, 2.025], [0.18, 2.019], [0.38, 1.986], [0.60, 1.914],
      [0.80, 1.800], [0.96, 1.646], [1.065, 1.485], [1.100, 1.402],
      [1.100, 1.370], [1.087, 1.345], [1.051, 1.343],
      [1.032, 1.370], [0.995, 1.453], [0.901, 1.600],
      [0.747, 1.750], [0.541, 1.884], [0.340, 1.942],
      [0.170, 1.969], [0, 1.975],
    ].reverse());
    const glow = mesh(new THREE.CylinderGeometry(1.045, 1.045, 0.021, 112), diffuser);
    glow.position.y = 1.356;
    const collar = mesh(new THREE.CylinderGeometry(0.157, 0.163, 0.045, 48), brass);
    collar.position.y = 1.323;
    bulb.position.set(0, 1.19, 0);
    addCord(0.47);
  }

  function buildArc() {
    const base = plinth(0.46);
    base.scale.x = 1.16;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.04, 0.15, 0),
      new THREE.Vector3(-0.14, 0.56, 0),
      new THREE.Vector3(-0.33, 1.03, 0),
      new THREE.Vector3(-0.35, 1.56, 0),
      new THREE.Vector3(-0.19, 2.05, 0),
      new THREE.Vector3(0.12, 2.38, 0),
    ]);
    mesh(new THREE.TubeGeometry(curve, 80, 0.105, 24, false));
    const shade = lathe([
      [0, 0.223], [0.22, 0.216], [0.47, 0.191], [0.71, 0.144],
      [0.94, 0.073], [1.10, -0.005], [1.177, -0.052],
      [1.19, -0.080], [1.181, -0.109], [1.155, -0.122],
      [1.125, -0.112], [0.98, -0.062], [0.68, 0.01], [0, 0.048],
    ].reverse());
    shade.position.set(0.16, 2.36, 0);
    const glow = mesh(new THREE.CylinderGeometry(1.126, 1.126, 0.019, 112), diffuser);
    glow.position.set(0.16, 2.251, 0);
    bulb.position.set(0.16, 2.10, 0);
    addCord(0.46);
  }

  function buildColumn() {
    plinth(0.43);
    lathe([
      [0, 0.13], [0.145, 0.13], [0.172, 0.20], [0.170, 0.41],
      [0.141, 0.72], [0.136, 1.24], [0, 1.24],
    ]);
    lathe([
      [0.58, 1.10], [0.621, 1.105], [0.642, 1.129], [0.647, 1.174],
      [0.647, 2.574], [0.642, 2.620], [0.620, 2.646], [0.58, 2.650],
      [0.574, 2.613], [0.574, 1.139], [0.58, 1.10],
    ]);
    const ribCount = 64;
    const ribs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.027, 0.027, 1.423, 10), ceramic, ribCount);
    const transform = new THREE.Matrix4();
    for (let index = 0; index < ribCount; index += 1) {
      const angle = index / ribCount * Math.PI * 2;
      transform.makeTranslation(Math.cos(angle) * 0.646, 1.875, Math.sin(angle) * 0.646);
      ribs.setMatrixAt(index, transform);
    }
    ribs.instanceMatrix.needsUpdate = true;
    ribs.castShadow = true;
    ribs.receiveShadow = true;
    lamp.add(ribs);
    const bottomGlow = mesh(new THREE.CylinderGeometry(0.577, 0.577, 0.018, 96), diffuser);
    bottomGlow.position.y = 1.114;
    const topGlow = mesh(new THREE.CylinderGeometry(0.578, 0.578, 0.019, 96), diffuser);
    topGlow.position.y = 2.622;
    bulb.position.set(0, 0.96, 0);
    addCord(0.43);
  }

  const builders = { mora: buildMora, arc: buildArc, column: buildColumn };

  function disposeLampGeometry() {
    const geometries = new Set();
    for (const child of [...lamp.children]) {
      if (child === bulb) continue;
      child.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.isInstancedMesh) object.dispose();
      });
      lamp.remove(child);
    }
    geometries.forEach(geometry => geometry.dispose());
  }

  function applyBrightness() {
    const normalized = brightness / 100;
    diffuser.emissiveIntensity = normalized * 1.95;
    // At zero, the diffuser still reads as a cream physical surface under studio light.
    bulb.intensity = normalized * normalized * 6.0;
  }

  function updateCamera() {
    const aspect = width / Math.max(height, 1);
    const isMora = currentModel === 'mora';
    cameraTarget.y = isMora ? 1.02 : 1.43;
    // Portrait cards need extra distance so the broad Arc shade is never clipped.
    const distance = (isMora ? 4.4 : 6.0) * Math.max(1, 0.96 / aspect);
    camera.position.set(0, cameraTarget.y + Math.sin(pitch) * distance, Math.cos(pitch) * distance);
    camera.lookAt(cameraTarget);
    camera.updateMatrixWorld();
  }

  function canRender() {
    return !disposed && !contextLost && inView && !document.hidden;
  }

  function requestRender() {
    if (!frame && canRender()) frame = window.requestAnimationFrame(renderFrame);
  }

  function cancelFrame() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  function finishDifference() {
    return Math.abs(ceramic.color.r - finishTarget.r)
      + Math.abs(ceramic.color.g - finishTarget.g)
      + Math.abs(ceramic.color.b - finishTarget.b);
  }

  function renderFrame(time) {
    frame = 0;
    if (!canRender()) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = time;
    if (!paused && !reduceMotion && !dragging) targetYaw += dt * 0.085;
    const ease = reduceMotion ? 1 : 1 - Math.exp(-dt * 13);
    yaw += (targetYaw - yaw) * ease;
    pitch += (targetPitch - pitch) * ease;
    brightness += (targetBrightness - brightness) * ease;
    ceramic.color.lerp(finishTarget, ease);
    lamp.rotation.y = yaw;
    updateCamera();
    applyBrightness();

    try {
      renderer.render(scene, camera);
    } catch (error) {
      contextLost = true;
      onError?.(error instanceof Error ? error : new Error('The 3D preview could not be rendered.'));
      return;
    }
    if (!ready) {
      ready = true;
      onReady?.();
    }

    const settling = Math.abs(targetYaw - yaw) > 0.0002
      || Math.abs(targetPitch - pitch) > 0.0002
      || Math.abs(targetBrightness - brightness) > 0.01
      || finishDifference() > 0.0003;
    if ((!paused && !reduceMotion && !dragging) || settling) requestRender();
    else lastTime = 0;
  }

  function resize() {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    const newWidth = Math.max(1, Math.round(bounds.width || canvas.parentElement?.clientWidth || 640));
    const newHeight = Math.max(1, Math.round(bounds.height || canvas.parentElement?.clientHeight || 600));
    const newPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    if (newWidth !== width || newHeight !== height || pixelRatio !== newPixelRatio) {
      width = newWidth;
      height = newHeight;
      pixelRatio = newPixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      updateCamera();
      requestRender();
    }
  }

  function pointerDown(event) {
    if (disposed || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, previousX: event.clientX, previousY: event.clientY, intent: null };
  }

  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.id || drag.intent === 'scroll') return;
    const totalX = event.clientX - drag.x;
    const totalY = event.clientY - drag.y;
    if (!drag.intent) {
      if (Math.max(Math.abs(totalX), Math.abs(totalY)) < 6) return;
      if (event.pointerType !== 'mouse' && Math.abs(totalY) > Math.abs(totalX)) {
        drag.intent = 'scroll';
        return;
      }
      drag.intent = 'rotate';
      dragging = true;
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture(event.pointerId); } catch { /* Pointer may already have ended. */ }
    }
    if (event.cancelable) event.preventDefault();
    targetYaw += (event.clientX - drag.previousX) * 0.009;
    targetPitch = THREE.MathUtils.clamp(targetPitch + (event.clientY - drag.previousY) * 0.003, -0.13, 0.37);
    drag.previousX = event.clientX;
    drag.previousY = event.clientY;
    requestRender();
  }

  function pointerEnd(event) {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const pointerId = drag.id;
    drag = null;
    dragging = false;
    canvas.style.cursor = 'grab';
    try { if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId); } catch { /* No active capture. */ }
    requestRender();
  }

  function pointerLeave(event) {
    if (drag && !dragging) pointerEnd(event);
  }

  function visibilityChange() {
    if (document.hidden) {
      cancelFrame();
      pointerEnd();
    } else requestRender();
  }

  function motionChange(event) {
    if (!followsMotionPreference) return;
    reduceMotion = event.matches;
    requestRender();
  }

  function contextLoss(event) {
    event.preventDefault();
    contextLost = true;
    cancelFrame();
    onError?.(new Error('The 3D preview paused because its graphics context was interrupted.'));
  }

  function contextRestore() {
    if (disposed) return;
    contextLost = false;
    ready = false;
    requestRender();
  }

  canvas.addEventListener('pointerdown', pointerDown, { passive: true });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('lostpointercapture', pointerEnd);
  canvas.addEventListener('pointerleave', pointerLeave);
  canvas.addEventListener('webglcontextlost', contextLoss);
  canvas.addEventListener('webglcontextrestored', contextRestore);
  document.addEventListener('visibilitychange', visibilityChange);
  window.addEventListener('resize', resize, { passive: true });
  if (followsMotionPreference) motionQuery?.addEventListener?.('change', motionChange);

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(canvas);
  const intersectionObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
      if (disposed) return;
      inView = entries[0]?.isIntersecting ?? true;
      if (inView) requestRender();
      else cancelFrame();
    }, { threshold: 0 })
    : null;
  intersectionObserver?.observe(canvas);

  const api = {
    setFinish(key) {
      if (disposed || !Object.prototype.hasOwnProperty.call(finishColors, key)) return;
      currentFinish = key;
      finishTarget.copy(finishColors[key]);
      if (reduceMotion) ceramic.color.copy(finishTarget);
      requestRender();
    },
    setBrightness(value) {
      if (disposed || !Number.isFinite(Number(value))) return;
      targetBrightness = THREE.MathUtils.clamp(Number(value), 0, 100);
      if (reduceMotion) brightness = targetBrightness;
      requestRender();
    },
    setModel(key) {
      if (disposed || !Object.prototype.hasOwnProperty.call(builders, key) || currentModel === key) return;
      disposeLampGeometry();
      currentModel = key;
      builders[key]();
      requestRender();
    },
    rotateBy(delta) {
      if (disposed || !Number.isFinite(Number(delta))) return;
      targetYaw += Number(delta);
      requestRender();
    },
    reset() {
      if (disposed) return;
      // Reset the view without changing the customer's finish or light setting.
      targetYaw = -0.35;
      targetPitch = 0.025;
      // Keep the reset animation short after many complete turns.
      yaw = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      requestRender();
    },
    setPaused(value) {
      if (disposed) return;
      paused = Boolean(value);
      requestRender();
    },
    getState() {
      return {
        model: currentModel,
        finish: currentFinish,
        brightness: targetBrightness,
        paused,
        reducedMotion: Boolean(reduceMotion),
        rotation: targetYaw,
        pitch: targetPitch,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelFrame();
      pointerEnd();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerEnd);
      canvas.removeEventListener('pointercancel', pointerEnd);
      canvas.removeEventListener('lostpointercapture', pointerEnd);
      canvas.removeEventListener('pointerleave', pointerLeave);
      canvas.removeEventListener('webglcontextlost', contextLoss);
      canvas.removeEventListener('webglcontextrestored', contextRestore);
      document.removeEventListener('visibilitychange', visibilityChange);
      window.removeEventListener('resize', resize);
      if (followsMotionPreference) motionQuery?.removeEventListener?.('change', motionChange);
      canvas.style.cursor = oldCursor;
      canvas.style.touchAction = oldTouchAction;
      const geometries = new Set();
      const materials = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.isInstancedMesh) object.dispose();
        if (Array.isArray(object.material)) object.material.forEach(material => materials.add(material));
        else if (object.material) materials.add(object.material);
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      // Some materials may be unused by the currently selected model.
      for (const material of [ceramic, diffuser, brass, cordMaterial]) if (!materials.has(material)) material.dispose();
      contactTexture?.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      scene.clear();
    },
  };

  buildMora();
  applyBrightness();
  resize();
  requestRender();
  return api;
}

export default createLampViewer;
