import { createHash } from 'node:crypto';
import { assetPacks, customCharacterModels, customModelUrl } from '../assets/manifest.mjs';

export const importMap = JSON.stringify({ imports: {
  three: '/vendor/three/three.module.js',
  'three/addons/': '/vendor/three/addons/',
} });
export const importMapPolicy = `'sha256-${createHash('sha256').update(importMap).digest('base64')}'`;

export const sceneFiles = new Map([
  ['/scene.mjs', ['scene.mjs', 'text/javascript; charset=utf-8']],
  ['/scene-camera.mjs', ['scene-camera.mjs', 'text/javascript; charset=utf-8']],
  ['/scene-layout.mjs', ['scene-layout.mjs', 'text/javascript; charset=utf-8']],
  ['/scene-motion.mjs', ['scene-motion.mjs', 'text/javascript; charset=utf-8']],
  ['/scene-labels.mjs', ['scene-labels.mjs', 'text/javascript; charset=utf-8']],
  ['/scene-cast.mjs', ['scene-cast.mjs', 'text/javascript; charset=utf-8']],
  ['/asset-manifest.mjs', ['../assets/manifest.mjs', 'text/javascript; charset=utf-8']],
]);
for (const [url, path] of [
  ['three.module.js', 'build/three.module.js'],
  ['three.core.js', 'build/three.core.js'],
  ['addons/controls/OrbitControls.js', 'examples/jsm/controls/OrbitControls.js'],
  ['addons/loaders/GLTFLoader.js', 'examples/jsm/loaders/GLTFLoader.js'],
  ['addons/utils/BufferGeometryUtils.js', 'examples/jsm/utils/BufferGeometryUtils.js'],
  ['addons/utils/SkeletonUtils.js', 'examples/jsm/utils/SkeletonUtils.js'],
]) {
  sceneFiles.set(`/vendor/three/${url}`, [`../node_modules/three/${path}`, 'text/javascript; charset=utf-8']);
}
for (const pack of assetPacks) {
  for (const name of Object.keys(pack.files)) {
    const contentType = name.endsWith('.glb') ? 'model/gltf-binary' : name.endsWith('.png') ? 'image/png' : 'text/plain; charset=utf-8';
    sceneFiles.set(`/assets/kenney/${pack.folder}/${name}`, [`../assets/cache/kenney/${pack.folder}/${name}`, contentType]);
  }
}
// 自制角色不进压缩包缓存，直接从仓库读取
for (const name of customCharacterModels) {
  sceneFiles.set(customModelUrl(name), [`../assets/models/characters/${name}.glb`, 'model/gltf-binary']);
}
