import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { framingCorners, roomCorners } from '../web/scene-camera.mjs';
import { meetingLayout } from '../web/scene-layout.mjs';

const room = { width: 13.8, depth: 11.2 };
const target = new THREE.Vector3(0, 0.8, 0);
const fov = 30;

// 用真实的透视相机复现渲染时的投影，验证取景数学
function projected(frame, corners, aspect) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 200);
  camera.position.copy(frame.position);
  camera.lookAt(frame.target);
  camera.updateMatrixWorld(true);
  return corners.map(corner => corner.clone().project(camera));
}

function fit(direction, aspect) {
  const frame = framingCorners({ corners: roomCorners(room), direction, target, fov, aspect });
  return { frame, points: projected(frame, roomCorners(room), aspect) };
}

test('取景把整间房放进视锥，并让投影落在画面中间', () => {
  for (const aspect of [0.6, 1.5, 2.14, 3.4]) {
    for (const direction of [new THREE.Vector3(10, 8.2, 12), new THREE.Vector3(1.6, 15, 5.4)]) {
      const { points } = fit(direction.normalize(), aspect);
      const bounds = new THREE.Box2();
      for (const point of points) {
        bounds.expandByPoint(new THREE.Vector2(point.x, point.y));
        // 八个角都要在画面内，而且必须在相机前方
        assert.ok(Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1, `角点出画面：${point.x}, ${point.y}`);
        assert.ok(point.z > -1 && point.z < 1, `角点不在视锥深度内：${point.z}`);
      }
      const center = bounds.getCenter(new THREE.Vector2());
      assert.ok(Math.abs(center.x) < 0.02 && Math.abs(center.y) < 0.02, `投影没居中：${center.x}, ${center.y}`);
      // 不能取景到画面一角：至少有一个方向要接近画幅边缘，否则就是白留一大片空白
      const fill = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
      assert.ok(fill > 0.85, `房间在画面里太小：${fill}`);
    }
  }
});

test('取景距离随宽高比变化，窄画幅把相机推得更远', () => {
  const wide = fit(new THREE.Vector3(10, 8.2, 12).normalize(), 2.14).frame;
  const narrow = fit(new THREE.Vector3(10, 8.2, 12).normalize(), 1.0).frame;
  assert.ok(narrow.position.distanceTo(narrow.target) > wide.position.distanceTo(wide.target));
  // 上下再斜看也是同一间房：相机不会跑到地板下面
  const overhead = fit(new THREE.Vector3(1.6, 15, 5.4).normalize(), 2.14).frame;
  assert.ok(overhead.position.y > room.depth);
});

test('真实房间布局也能被完整取景', () => {
  const layout = meetingLayout(4);
  const frame = framingCorners({ corners: roomCorners(layout), direction: new THREE.Vector3(10, 8.2, 12).normalize(), target, fov, aspect: 2.14 });
  for (const point of projected(frame, roomCorners(layout), 2.14)) {
    assert.ok(Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1);
  }
});
