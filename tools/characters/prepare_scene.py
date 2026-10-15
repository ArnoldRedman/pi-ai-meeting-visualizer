# 准备某个角色的 MCP 工作场景：导入原角色骨架、改名成 character-<名字>、存盘
# 用法：blender -b --factory-startup -P tools/characters/prepare_scene.py -- <名字>
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
name = args[0] if args else 'gemini'

BASE = ROOT / 'assets' / 'cache' / 'kenney' / 'characters' / 'character-female-a.glb'
OUT = ROOT / 'assets' / 'models' / 'characters' / f'{name}-work.blend'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(BASE))
helper = bpy.data.objects.get('Icosphere')  # 导入器生成的骨骼显示形状
if helper:
    bpy.data.objects.remove(helper, do_unlink=True)

armature = next(obj for obj in bpy.data.objects if obj.type == 'ARMATURE')
print('原名', armature.name, '| 动作', len(bpy.data.actions))
armature.name = f'character-{name}'
armature.data.name = f'character-{name}'
for obj in [o for o in bpy.data.objects if o.type == 'MESH']:
    obj.name = f'{obj.name}-base'
bpy.context.scene.view_settings.view_transform = 'Standard'
bpy.context.scene.frame_set(1)

OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
print('已保存', OUT)
