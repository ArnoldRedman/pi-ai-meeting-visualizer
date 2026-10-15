import * as THREE from 'three';

// 取景要保证这八个点都在画面里：地板外沿和墙顶的四个角
const FLOOR = -0.4;
const WALL_TOP = 2.8;
const EDGE = 0.2;

export function roomCorners({ width, depth }) {
  const corners = [];
  for (const x of [-width / 2 - EDGE, width / 2 + EDGE]) {
    for (const y of [FLOOR, WALL_TOP]) {
      for (const z of [-depth / 2 - EDGE, depth / 2 + EDGE]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  return corners;
}

function project(point, position, direction, right, up, vertical, horizontal) {
  const offset = point.clone().sub(position);
  const depth = -offset.dot(direction);
  return new THREE.Vector2(offset.dot(right) / (depth * horizontal), offset.dot(up) / (depth * vertical));
}

// 求一个装得下这些点、又把它们的投影摆到画面正中的透视机位；direction 是「目标指向相机」的方向
export function framingCorners({ corners, direction, target, up = new THREE.Vector3(0, 1, 0), fov, aspect, padding = 1.06 }) {
  const forward = direction.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const cameraUp = new THREE.Vector3().crossVectors(right, forward).normalize();
  const vertical = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const horizontal = vertical * aspect;
  const centered = corners.map(corner => corner.clone().sub(target));
  let distance = 0;
  for (const corner of centered) {
    const depth = corner.dot(forward);
    distance = Math.max(distance,
      Math.abs(corner.dot(cameraUp)) / vertical - depth,
      Math.abs(corner.dot(right)) / horizontal - depth);
  }
  distance *= padding;
  const position = target.clone().addScaledVector(direction, distance);
  // 近大远小让投影上下不对称，按投影包围盒中心整体平移相机，否则取景框会空出一大块
  const bounds = new THREE.Box2();
  for (const corner of corners) bounds.expandByPoint(project(corner, position, direction, right, cameraUp, vertical, horizontal));
  const center = bounds.getCenter(new THREE.Vector2());
  const shift = right.clone().multiplyScalar(center.x * horizontal * distance)
    .add(cameraUp.clone().multiplyScalar(center.y * vertical * distance));
  return { position: position.add(shift), target: target.clone().add(shift) };
}
