import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { framingCorners, roomCorners } from './scene-camera.mjs';
import { characterModels, customCharacterModels, customModelUrl, furnitureModels, modelUrl } from '/asset-manifest.mjs';
import { vendorCharacter } from './scene-cast.mjs';
import { meetingLayout, previewSeats, seatAppearance } from './scene-layout.mjs';
import { initialMeeting } from './state.mjs';
import { createMotion, setIntent, advanceMotion, seatIntent, presentationStage, screenCopy } from './scene-motion.mjs';
import { createLabels } from './scene-labels.mjs';

// 预设机位：斜视看全局，俯视看座位分布；重置视角回到斜视
const HOME_DIRECTION = new THREE.Vector3(10, 8.2, 12).normalize();
const OVERHEAD_DIRECTION = new THREE.Vector3(1.6, 15, 5.4).normalize();
const ROOM_TARGET = new THREE.Vector3(0, 0.8, 0);
// 透视视角：视场角给到刚好能看出远近，又不变形；聚焦单个人物时的相机距离约让人物占画面一半高
const VIEW_FOV = 30;
const FOCUS_DISTANCE = 5.6;

// Kenney 家具以角落为原点，角色使用骨骼原点；统一包装而不改写原始 GLB
function fitModel(model, size) {
  const wrapper = new THREE.Group();
  const bounds = new THREE.Box3().setFromObject(model);
  const measured = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  wrapper.add(model);
  if (typeof size === 'number') wrapper.scale.setScalar(size / measured.y);
  else wrapper.scale.set(size[0] / measured.x, size[1] / measured.y, size[2] / measured.z);
  wrapper.traverse(object => {
    if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
  });
  return wrapper;
}

function disposeObjects(roots) {
  const resources = new Set();
  for (const root of roots) root.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) {
    resource.dispose();
    if (resource.isTexture) resource.source.data?.close?.();
  }
}

export async function createMeetingScene(canvas, viewButtons, reportError, notifyFocus) {
  const loader = new GLTFLoader();
  // 自制角色一共约 6.6 MB，本地服务一次预载完，换席位时不用等
  const names = [...characterModels, ...customCharacterModels, ...furnitureModels];
  const results = await Promise.allSettled(names.map(name => loader.loadAsync(
    customCharacterModels.includes(name) ? customModelUrl(name)
      : modelUrl(characterModels.includes(name) ? 'characters' : 'furniture', name),
  )));
  const loaded = results.filter(result => result.status === 'fulfilled').map(result => result.value.scene);
  if (results.some(result => result.status === 'rejected')) {
    disposeObjects(loaded);
    throw new Error('3D 资源未就绪，请确认 assets/models/characters 下的角色齐全，并在项目目录运行 npm run assets:fetch 后刷新；下方文字状态仍可使用');
  }
  const models = new Map(names.map((name, index) => [name, results[index].value]));
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  } catch {
    disposeObjects(loaded);
    throw new Error('浏览器无法创建 WebGL 场景，请检查硬件加速；下方文字状态仍可使用');
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1eee6);
  const camera = new THREE.PerspectiveCamera(VIEW_FOV, 1, 0.1, 100);
  const { view: viewButton, reset: resetButton } = viewButtons;
  // 自由视角交给官方轨道控制器；挂在容器而不是画布上，覆盖在人物上方的事件气泡就不会变成拖不动的死区
  // 极角留在地平线以上，否则视线会被房间背面和侧墙挡住，只能看到墙的外墙皮
  const controls = new OrbitControls(camera, canvas.parentElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.maxPolarAngle = 1.2;
  // 透视相机的缩放靠推拉相机，距离范围就是缩放范围：不能穿到墙里，也不至于远到看不见
  controls.minDistance = 2.2;
  controls.maxDistance = 46;
  // 自由视角下滚轮朝鼠标位置推进，聚焦时改回围绕人物缩放
  controls.zoomToCursor = true;
  // 先摆在默认斜视方向上（距离由取景重算），否则首帧的轨道极角是垂直向上的
  camera.position.copy(ROOM_TARGET).addScaledVector(HOME_DIRECTION, 20);
  controls.target.copy(ROOM_TARGET);
  controls.update();
  const hemisphere = new THREE.HemisphereLight(0xfff8e9, 0x899e91, 2.0);
  scene.add(hemisphere);
  const sunlight = new THREE.DirectionalLight(0xffefd6, 2.8);
  sunlight.position.set(-3, 8, 5);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.normalBias = 0.04;
  sunlight.shadow.camera.near = 0.5;
  sunlight.shadow.camera.far = 35;
  scene.add(sunlight);
  let room = new THREE.Group();
  scene.add(room);
  let actors = [];
  let layout = meetingLayout(4);
  let rosterKey = '';
  let overhead = false;
  let disposed = false;
  let inView = true;
  let lastTime = 0;
  let looping = false;
  let painting = false;
  let pressed = null;
  // 最近推送事件的席位：圆环呼吸更快、气泡带标记，让人一眼看出「现在谁在更新」
  let activeId = null;
  let hoveredId = null;
  let hoveredAt = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const owned = [];
  const overlay = canvas.parentElement.querySelector('.scene-labels');
  const stageLabel = canvas.closest('.meeting-panel').querySelector('#scene-stage');
  let labels = null;
  let screen = null;
  let screenKey = '';
  let currentState = initialMeeting();
  let firstUpdate = true;

  function box(width, height, depth, color, x, y, z) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    owned.push(geometry, material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    room.add(mesh);
    return mesh;
  }

  function furniture(name, size, x, y, z, rotation = 0) {
    const model = fitModel(models.get(name).scene.clone(true), size);
    model.position.set(x, y, z);
    model.rotation.y = rotation;
    room.add(model);
    return model;
  }

  function releaseActors() {
    const skeletons = new Set();
    for (const actor of actors) {
      actor.mixer.stopAllAction();
      actor.mixer.uncacheRoot(actor.model);
      actor.model.traverse(object => { if (object.isSkinnedMesh) skeletons.add(object.skeleton); });
    }
    for (const skeleton of skeletons) skeleton.dispose();
  }

  function createRoom(seats) {
    releaseActors();
    labels?.dispose();
    for (const resource of owned.splice(0)) resource.dispose();
    // 家具与角色克隆共享原始纹理/网格，只释放本轮独有物体，避免下一轮使用已释放材质
    scene.remove(room);
    room = new THREE.Group();
    scene.add(room);
    layout = meetingLayout(seats.length);
    canvas.parentElement.dataset.density = seats.length > 8 ? 'many' : seats.length > 4 ? 'medium' : 'normal';
    const { width, depth, tableWidth, slots, windowZs, props } = layout;
    const wallZ = -depth / 2;
    const screenZ = layout.screenZ;
    furniture('floorFull', [width, 0.14, depth], 0, -0.14, 0);
    box(width + 0.16, 0.17, depth + 0.16, 0xb9ac96, 0, -0.23, 0);
    box(width, 2.6, 0.16, 0xd5e0d5, 0, 1.3, wallZ);
    // 侧墙由窗口模块首尾相接铺满整条边长，宽度随房间深度均分，不留补墙缝隙
    for (const z of windowZs) {
      furniture('wallWindow', [windowZs.length > 1 ? depth / windowZs.length : depth, 2.6, 0.14], -width / 2, 0, z, Math.PI / 2);
    }
    box(tableWidth + 1.7, 0.02, 4.9, 0xcbd6c8, 0, 0.015, 0);
    furniture('table', [tableWidth, 0.86, 1.45], 0, 0.04, 0);
    furniture('televisionModern', [2.8, 1.6, 0.18], 0, 0.85, screenZ - 0.12);
    const display = document.createElement('canvas');
    display.width = 1024;
    display.height = 576;
    const texture = new THREE.CanvasTexture(display);
    texture.colorSpace = THREE.SRGBColorSpace;
    const screenGeometry = new THREE.PlaneGeometry(2.55, 1.12);
    const screenMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    const panel = new THREE.Mesh(screenGeometry, screenMaterial);
    panel.position.set(0, 1.85, screenZ);
    room.add(panel);
    owned.push(texture, screenGeometry, screenMaterial);
    screen = { display, texture, context: display.getContext('2d') };
    screenKey = '';
    furniture('bookcaseOpen', [1.05, 1.95, 0.55], props.bookcase.x, 0, props.bookcase.z);
    furniture('books', 0.22, props.bookcase.x - 0.03, 1.0, props.bookcase.z + 0.1);
    furniture('pottedPlant', 1.45, width / 2 - 0.55, 0, wallZ + 0.65);
    furniture('pottedPlant', 1.05, props.cornerPlant.x, 0, props.cornerPlant.z);
    furniture('loungeSofa', [1.55, 0.86, 0.75], props.sofa.x, 0, props.sofa.z, -Math.PI / 2);
    furniture('sideTable', [0.68, 0.68, 0.65], props.sideTable.x, 0, props.sideTable.z);
    furniture('kitchenCoffeeMachine', 0.38, props.sideTable.x, 0.68, props.sideTable.z, -Math.PI / 2);
    furniture('lampRoundFloor', 1.8, width / 2 - 0.6, 0, depth / 2 - 1.0);
    furniture('books', 0.14, 0, 0.91, 0);

    actors = seats.map((seat, index) => {
      const slot = slots[index];
      const chair = furniture('chairDesk', 1.13, slot.x, 0.035, slot.chairZ, slot.rotation);
      // 电脑屏幕应朝向使用者，方向与人物面向桌子的方向相反
      furniture('laptop', [0.47, 0.28, 0.38], slot.x, 0.9, slot.z * 0.29, slot.laptopRotation);
      // 认不出的厂家用默认角色，按席位顺序轮换，同一场会议不重样
      const source = models.get(vendorCharacter(seat) ?? characterModels[index % characterModels.length]);
      const model = cloneSkeleton(source.scene);
      const figure = fitModel(model, 1.35);
      figure.position.set(slot.x, 0.045, slot.z);
      figure.rotation.y = slot.rotation;
      room.add(figure);
      const ringGeometry = new THREE.RingGeometry(0.42, 0.5, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x9faea5, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(slot.x, 0.041, slot.z);
      room.add(ring);
      owned.push(ringGeometry, ringMaterial);
      const mixer = new THREE.AnimationMixer(model);
      return {
        id: seat.id, seat, model, figure, mixer, clips: source.animations, ring, chair,
        motion: createMotion(slot, index), animation: '', action: null,
      };
    });
    labels = createLabels(overlay, seats);
    const extent = Math.max(width, depth) / 2 + 2;
    Object.assign(sunlight.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent });
    sunlight.shadow.camera.updateProjectionMatrix();
    resize();
  }

  let focusId = null;
  let focusHome = null;
  let glide = null;
  // 用户一旦自己转过镜头，就不再用尺寸变化重新取景，只跟着改宽高比
  let touched = false;

  function viewDirection() {
    return camera.position.clone().sub(controls.target).normalize();
  }

  // 只算不摆，交给纯函数：求出从 direction 方向看过去、刚好装下整间房所需的相机机位
  function framing(direction) {
    return framingCorners({
      corners: roomCorners(layout), direction, target: ROOM_TARGET,
      up: camera.up, fov: camera.fov, aspect: camera.aspect,
    });
  }

  function applyFraming({ position, target }) {
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  }

  function glideTo(frame, duration = 650) {
    glide = {
      from: camera.position.clone(), fromTarget: controls.target.clone(),
      to: frame.position, toTarget: frame.target, start: performance.now(), duration,
    };
  }

  function seatPoint(actor) {
    return new THREE.Vector3(actor.motion.x, 0.95, actor.motion.z);
  }

  // 点击某个席位就聚焦到他身上：镜头拉近并一直跟着他，直到取消或按重置视角
  function setFocus(seatId) {
    const actor = actors.find(item => item.id === seatId) ?? null;
    if (actor) {
      if (!focusId) focusHome = { position: camera.position.clone(), target: controls.target.clone() };
      focusId = actor.id;
      const point = seatPoint(actor);
      // 保持当前观察方向，只把轨道中心挪到人物身上并拉近，避免镜头突然翻转
      glideTo({ position: point.clone().addScaledVector(viewDirection(), FOCUS_DISTANCE), target: point });
    } else {
      if (!focusId) return;
      focusId = null;
      glideTo(focusHome ?? framing(overhead ? OVERHEAD_DIRECTION : HOME_DIRECTION));
      focusHome = null;
    }
    // 跟随时禁用平移，否则镜头每帧被拉回人物，平移看起来像失效
    controls.enablePan = !focusId;
    controls.zoomToCursor = !focusId;
    notifyFocus?.(focusId);
  }

  // 预设机位：重置视角回到斜视，切换俯视在两种预设间切换；两者都退出聚焦
  function setView(nextOverhead) {
    overhead = nextOverhead;
    viewButton.textContent = overhead ? '还原斜视' : '切换俯视';
    if (focusId) {
      focusId = null;
      controls.enablePan = true;
      controls.zoomToCursor = true;
      notifyFocus?.(null);
    }
    focusHome = null;
    glideTo(framing(overhead ? OVERHEAD_DIRECTION : HOME_DIRECTION));
  }

  function resize() {
    if (disposed) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // 用户还没自己转过镜头时，尺寸变化就重新取景；否则只改宽高比，保留他调好的距离和角度
    if (!touched && !glide && !focusId) applyFraming(framing(viewDirection()));
    paint();
  }

  function project(x, y, z) {
    const point = new THREE.Vector3(x, y, z).project(camera);
    return { x: (point.x + 1) * canvas.clientWidth / 2, y: (1 - point.y) * canvas.clientHeight / 2 };
  }

  function drawScreen(stage) {
    if (!screen) return;
    const seats = actors.map(actor => actor.seat);
    const { title, text } = screenCopy({
      stage, state: currentState, seats,
      latest: actors.find(actor => actor.id === activeId)?.seat ?? null,
      arrived: actors.filter(actor => actor.motion.seated).length,
    });
    const key = `${title}\n${text}`;
    if (screenKey === key) return;
    screenKey = key;
    const { context, texture } = screen;
    context.fillStyle = '#244b45';
    context.fillRect(0, 0, 1024, 576);
    context.fillStyle = '#a7cebb';
    context.font = '24px sans-serif';
    context.fillText('MEETING ROOM / LOCAL', 48, 56);
    context.fillStyle = '#ffffff';
    context.font = 'bold 54px "Microsoft YaHei", sans-serif';
    context.fillText(title, 48, 138);
    context.font = '34px "Microsoft YaHei", sans-serif';
    let line = '';
    let y = 210;
    for (const character of Array.from(text).slice(0, 220)) {
      if (character === '\n' || context.measureText(line + character).width > 910) {
        context.fillText(line, 48, y);
        y += 55;
        line = '';
        if (y > 500) { line = '…（完整结论见下方）'; break; }
      }
      if (character !== '\n') line += character;
    }
    context.fillText(line, 48, y);
    texture.needsUpdate = true;
    canvas.dataset.screenTitle = title;
  }

  function paint() {
    // 相机只在 paint 里推进：控制器的 update 会触发 change，重入会让镜头步进跑两遍
    if (painting) return;
    painting = true;
    stepCamera();
    const motions = actors.map(actor => actor.motion);
    const stage = presentationStage(currentState, motions);
    drawScreen(stage);
    canvas.dataset.presentation = stage;
    canvas.dataset.roaming = String(motions.filter(motion => motion.intent === 'roam').length);
    canvas.dataset.seated = String(motions.filter(motion => motion.seated).length);
    const description = ({ returning: '正在召集全员回座', summary: '全员已入座 · 正在看总结', failed: '全员已回座 · 会议异常结束', 'round-finished': '全员已回座 · 等待下一轮' })[stage]
      || `${actors.filter(actor => actor.seat.status === 'working').length} 人工作 · ${canvas.dataset.roaming} 人自由活动`;
    if (stageLabel.textContent !== description) stageLabel.textContent = description;
    if (labels) {
      labels.update(actors.map(actor => actor.seat), motions, activeId);
      const points = actors.map(actor => project(actor.figure.position.x, actor.figure.position.y + 1.38, actor.figure.position.z));
      const corners = [project(-1.45, 2.5, layout.screenZ), project(1.45, 2.5, layout.screenZ), project(-1.45, 1.15, layout.screenZ), project(1.45, 1.15, layout.screenZ)];
      const x = Math.min(...corners.map(point => point.x));
      const y = Math.min(...corners.map(point => point.y));
      labels.position(points, canvas.clientWidth, canvas.clientHeight, [{
        x, y, width: Math.max(...corners.map(point => point.x)) - x, height: Math.max(...corners.map(point => point.y)) - y,
      }]);
    }
    renderer.render(scene, camera);
    painting = false;
  }

  // 每帧推进镜头：先走过渡动画，没有过渡时跟着聚焦的人物走；缩放由控制器自己改相机距离
  function stepCamera() {
    if (glide) {
      const progress = Math.min(1, (performance.now() - glide.start) / glide.duration);
      const ease = progress * progress * (3 - 2 * progress);
      camera.position.lerpVectors(glide.from, glide.to, ease);
      controls.target.lerpVectors(glide.fromTarget, glide.toTarget, ease);
      if (progress === 1) glide = null;
    } else if (focusId) {
      const actor = actors.find(item => item.id === focusId);
      // 聚焦的人也会去摸鱼，镜头跟着他走：只平移，不改观察方向
      if (actor) {
        const shift = seatPoint(actor).sub(controls.target);
        camera.position.add(shift);
        controls.target.add(shift);
      }
    }
    controls.update();
  }

  // 用射线而不是 CSS 命中区选人：人物会走动，气泡也会被挤到别处
  function pick(event) {    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    let picked = null;
    for (const actor of actors) {
      const hit = raycaster.intersectObjects([actor.figure, actor.ring], true)[0];
      if (hit && (!picked || hit.distance < picked.distance)) picked = { id: actor.id, distance: hit.distance };
    }
    return picked?.id ?? null;
  }

  function onPointerMove(event) {
    // 拖动中不抢高亮，否则转镜头时高亮会跟着鼠标乱跑
    if (pressed || performance.now() - hoveredAt < 80) return;
    hoveredAt = performance.now();
    const id = pick(event);
    if (id === hoveredId) return;
    hoveredId = id;
    canvas.style.cursor = id ? 'pointer' : '';
    for (const bubble of canvas.parentElement.querySelectorAll('.character-bubble')) {
      bubble.classList.toggle('hovered', bubble.dataset.seat === hoveredId);
    }
    paint();
  }

  function onPointerLeave() {
    pressed = null;
    if (!hoveredId) return;
    hoveredId = null;
    canvas.style.cursor = '';
    for (const bubble of canvas.parentElement.querySelectorAll('.character-bubble.hovered')) bubble.classList.remove('hovered');
    paint();
  }

  function onPointerDown(event) {
    pressed = { x: event.clientX, y: event.clientY, target: event.target };
  }

  function onPointerUp(event) {
    const start = pressed;
    pressed = null;
    // 拖动是转视角，只有几乎没有位移的点击才算选人
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const bubble = start.target.closest?.('.character-bubble');
    setFocus(bubble ? bubble.dataset.seat : pick(event));
  }

  function moveActors(delta) {
    for (const actor of actors) {
      const { motion, seat } = actor;
      if (!reducedMotion.matches) advanceMotion(motion, delta);
      const walking = motion.path.length > 0;
      const appearance = seatAppearance(seat.status);
      const animation = walking ? 'walk' : motion.seated ? 'sit'
        : motion.intent === 'roam' ? (motion.spot?.animation ?? 'idle')
          : appearance.animation;
      if (actor.animation !== animation) {
        actor.animation = animation;
        if (actor.action) actor.action.fadeOut(0.15);
        const clip = THREE.AnimationClip.findByName(actor.clips, animation);
        const loop = ['idle', 'walk', 'interact-right'].includes(animation);
        actor.action = actor.mixer.clipAction(clip).reset();
        actor.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        actor.action.clampWhenFinished = true;
        actor.action.fadeIn(0.15).play();
        if (reducedMotion.matches) actor.mixer.update(0.4);
      }
      actor.mixer.update(delta);
      // 沙发上瘫着的摸鱼点会带 sitY，坐姿高度跟椅子一致但不占用入座状态
      const sitY = motion.seated ? 0.43 : (!walking ? motion.spot?.sitY : undefined);
      const targetY = sitY ?? 0.045;
      actor.figure.position.set(motion.x,
        reducedMotion.matches ? targetY : THREE.MathUtils.lerp(actor.figure.position.y, targetY, Math.min(1, delta * 12)), motion.z);
      actor.figure.rotation.y = motion.rotation;
      actor.chair.rotation.y = motion.seated ? motion.rotation : motion.slot.rotation;
      actor.ring.position.set(motion.x, 0.041, motion.z);
      pulseRing(actor);
    }
  }

  // 圆环同时表达三件事：正在工作的人在呼吸，刚推送事件的人弹一下，最近更新的那个人呼吸更快
  function pulseRing(actor) {
    const time = performance.now();
    const active = actor.id === activeId;
    const breath = actor.seat.status === 'working' || active ? Math.sin(time / (active ? 220 : 320)) * 0.07 : 0;
    const pop = actor.pop ? Math.max(0, 1 - (time - actor.pop) / 900) : 0;
    actor.ring.scale.setScalar((active ? 1.12 : 1) + breath + pop * pop * 0.7);
  }

  function update(state) {
    if (disposed) return;
    currentState = state;
    const seats = state.seats.length ? state.seats : previewSeats;
    // 角色模型跟着席位模型名走，所以重名的席位换了模型也要重建房间
    const key = JSON.stringify(seats.map(seat => [seat.id, seat.model ?? '']));
    if (key !== rosterKey) { createRoom(seats); rosterKey = key; }
    const instant = reducedMotion.matches || (firstUpdate && ['finished', 'failed'].includes(state.status));
    let changed = null;
    for (const [index, seat] of seats.entries()) {
      const actor = actors[index];
      // 席位数据变了就弹一下圆环，让「谁刚刚更新」在场景里直接看得见
      if (actor.seat && (actor.seat.status !== seat.status || actor.seat.message !== seat.message || actor.seat.stance !== seat.stance)) {
        actor.pop = performance.now();
        changed = actor.id;
      }
      actor.seat = seat;
      actor.ring.material.color.setHex(seatAppearance(seat.status).color);
      setIntent(actor.motion, seatIntent(state, seat), instant);
    }
    if (changed) activeId = changed;
    firstUpdate = false;
    moveActors(instant ? 0.4 : 0);
    canvas.dataset.seats = String(seats.length);
    canvas.dataset.working = String(seats.filter(seat => seat.status === 'working').length);
    canvas.dataset.phase = state.status;
    paint();
  }

  function frame(time) {
    if (time - lastTime < 1000 / 30) return;
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;
    moveActors(delta);
    paint();
  }

  function syncAnimation() {
    lastTime = 0;
    // 减少动态效果时不做镜头惯性，否则拖动停下来后残余的阻尼永远补不齐
    controls.enableDamping = !reducedMotion.matches;
    if (!disposed && reducedMotion.matches) {
      for (const actor of actors) setIntent(actor.motion, actor.motion.intent, true);
      moveActors(0);
    }
    looping = !disposed && inView && !document.hidden && !reducedMotion.matches;
    renderer.setAnimationLoop(looping ? frame : null);
    if (!disposed) paint();
  }
  // 循环跑着时由 frame 负责重画；停止渲染时（减少动态效果、页面切走）靠控制器的变化事件补一帧
  function onControlsChange() {
    if (!looping) paint();
  }
  function cancelGlide() {
    glide = null;
    touched = true;
  }
  const homeView = () => setView(false);
  const otherView = () => setView(!overhead);
  function contextLost(event) {
    event.preventDefault();
    dispose();
    reportError('3D 图形上下文已丢失，请刷新恢复；下方文字状态继续保留');
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const visibility = new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    syncAnimation();
  });
  visibility.observe(canvas);
  document.addEventListener('visibilitychange', syncAnimation);
  reducedMotion.addEventListener('change', syncAnimation);
  viewButton.addEventListener('click', otherView);
  resetButton.addEventListener('click', homeView);
  canvas.addEventListener('webglcontextlost', contextLost);
  // 气泡有独立命中区，点击事件从容器冒泡上来，和轨道控制器监听的是同一个元素
  const container = canvas.parentElement;
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerleave', onPointerLeave);
  controls.addEventListener('change', onControlsChange);
  controls.addEventListener('start', cancelGlide);

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    observer.disconnect();
    visibility.disconnect();
    document.removeEventListener('visibilitychange', syncAnimation);
    reducedMotion.removeEventListener('change', syncAnimation);
    viewButton.removeEventListener('click', otherView);
    resetButton.removeEventListener('click', homeView);
    canvas.removeEventListener('webglcontextlost', contextLost);
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerleave', onPointerLeave);
    canvas.style.cursor = '';
    controls.removeEventListener('change', onControlsChange);
    controls.removeEventListener('start', cancelGlide);
    controls.dispose();
    releaseActors();
    labels?.dispose();
    for (const resource of owned) resource.dispose();
    disposeObjects(loaded);
    renderer.dispose();
  }
  syncAnimation();
  return { update, dispose, focus: setFocus };
}
