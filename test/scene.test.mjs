import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { assetPacks, characterModels, customCharacterModels, customModelUrl, modelUrl } from '../assets/manifest.mjs';
import { extractPack } from '../scripts/fetch-assets.mjs';
import { sceneFiles, importMap, importMapPolicy } from '../server/scene-files.mjs';
import { meetingLayout, seatAppearance } from '../web/scene-layout.mjs';
import { vendorCharacter, vendorCharacters } from '../web/scene-cast.mjs';

function fixture(files = { 'Models/actor.glb': strToU8('fixture'), 'ignore.txt': strToU8('ignored') }) {
  const archive = zipSync(files);
  return { archive, pack: {
    title: '测试资源', files: { 'actor.glb': 'Models/actor.glb' },
    sha256: createHash('sha256').update(archive).digest('hex'),
  } };
}

test('下载缓存校验 SHA-256，并且只解压清单指定的条目', () => {
  const { archive, pack } = fixture();
  const files = extractPack(pack, archive);
  assert.deepEqual(Object.keys(files), ['Models/actor.glb']);
  assert.throws(() => extractPack({ ...pack, sha256: 'wrong' }, archive), /SHA-256/);
  const missing = fixture({ 'other.glb': strToU8('missing') });
  assert.throws(() => extractPack(missing.pack, missing.archive), /缺少所需文件/);
});

test('资源路径受固定清单约束，ZIP 和整个 node_modules 均不公开', () => {
  for (const pack of assetPacks) {
    assert.equal(new URL(pack.url).hostname, 'kenney.nl');
    assert.match(pack.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Object.hasOwn(pack.files, 'License.txt'));
    for (const name of Object.keys(pack.files)) {
      assert.equal(name.includes('..'), false);
      assert.ok(sceneFiles.has(`/assets/kenney/${pack.folder}/${name}`));
    }
  }
  assert.ok(sceneFiles.has('/assets/kenney/characters/Textures/colormap.png'));
  for (const model of characterModels) assert.ok(sceneFiles.has(modelUrl('characters', model)));
  for (const model of customCharacterModels) assert.ok(sceneFiles.has(customModelUrl(model)));
  for (const path of ['/assets/kenney/mini-characters.zip', '/node_modules/three/package.json', '/assets/kenney/characters/../../package.json']) {
    assert.equal(sceneFiles.has(path), false);
  }
});

test('import map 只解析本地模块，CSP 哈希与内容一致', () => {
  const imports = JSON.parse(importMap).imports;
  assert.equal(imports.three, '/vendor/three/three.module.js');
  assert.equal(imports['three/addons/'], '/vendor/three/addons/');
  assert.equal(importMapPolicy, `'sha256-${createHash('sha256').update(importMap).digest('base64')}'`);
  // 场景的自由视角依赖这个 addon，漏掉它会让整个 3D 模块导入失败
  assert.ok(sceneFiles.has('/vendor/three/addons/controls/OrbitControls.js'));
});

test('1–16 个席位布局均不重叠，人数增加时会议桌和房间同步扩展', () => {
  for (let count = 1; count <= 16; count++) {
    const layout = meetingLayout(count);
    assert.equal(layout.slots.length, count);
    assert.equal(new Set(layout.slots.map(slot => `${slot.x}/${slot.z}`)).size, count);
    assert.ok(layout.width > layout.tableWidth + 2);
    for (const slot of layout.slots) {
      assert.ok(Math.abs(slot.x) < layout.tableWidth / 2);
      assert.ok(Math.abs(slot.z) > 1.45 / 2 + 0.4);
      assert.ok(Math.abs(slot.chairZ) < layout.depth / 2 - 0.5);
    }
  }
  assert.ok(meetingLayout(16).width > meetingLayout(4).width);
});

test('按模型名匹配厂家角色，认不出的厂家回落到默认角色', () => {
  assert.equal(vendorCharacter({ model: 'GPT-5.6' }), 'character-gpt');
  assert.equal(vendorCharacter({ model: 'gpt-6-codex' }), 'character-gpt');
  // Claude 的档位名没有厂家前缀，同样要认出
  for (const model of ['opus', 'sonnet', 'haiku-4-5', 'fable', 'anthropic/claude-4-5']) {
    assert.equal(vendorCharacter({ model }), 'character-claude');
  }
  assert.equal(vendorCharacter({ model: 'Kimi K2' }), 'character-kimi');
  assert.equal(vendorCharacter({ model: 'gemini-3-pro' }), 'character-gemini');
  assert.equal(vendorCharacter({ id: 'grok', label: '风险分析', model: 'x-ai/grok-4' }), 'character-grok');
  for (const seat of [{ model: 'Mistral Large' }, { model: '' }, { label: '风险审阅' }, {}]) {
    assert.equal(vendorCharacter(seat), null);
  }
  for (const [name] of vendorCharacters) assert.ok(customCharacterModels.includes(name));
});

test('工作与收尾使用官方动画，失败或停止不继续工作动作', () => {
  assert.deepEqual(seatAppearance('working'), { color: 0xc8903e, animation: 'interact-right', loop: true });
  assert.equal(seatAppearance('done').animation, 'emote-yes');
  assert.equal(seatAppearance('done').loop, false);
  assert.equal(seatAppearance('failed').animation, 'emote-no');
  assert.equal(seatAppearance('failed').loop, false);
  assert.equal(seatAppearance('stopped').animation, 'idle');
  assert.equal(seatAppearance('waiting').animation, 'idle');
});
