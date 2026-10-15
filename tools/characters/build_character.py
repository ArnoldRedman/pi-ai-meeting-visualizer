# 生成角色模型（无界面，不需要开着 Blender）
#
# 用法：blender -b --factory-startup -P tools/characters/build_character.py -- <名字>
#   例：blender -b --factory-startup -P tools/characters/build_character.py -- gpt
# 输出：assets/models/characters/character-<名字>.glb
#
# 做法：导入 Kenney 原角色拿到骨架和 32 个动作，只把网格换成 <名字>.py 里设计的外形，
# 每个部位刚性绑定到对应骨头，因此动作、坐姿和场地对齐都不用改。
# 想实时调形可以在 Blender GUI 里跑 prepare_scene.py + live_rebuild.py + export_live.py。
import importlib
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'characters'))

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
NAME = args[0] if args else 'gemini'
chibi = importlib.import_module('chibi')
design = importlib.import_module(NAME)

BASE = ROOT / 'assets' / 'cache' / 'kenney' / 'characters' / 'character-female-a.glb'
TARGET = ROOT / 'assets' / 'models' / 'characters' / f'character-{NAME}.glb'
MESH_NAME = f'{NAME}-mesh'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(BASE))

helper = bpy.data.objects.get('Icosphere')  # 导入器生成的骨骼显示形状，不属于模型
if helper:
    bpy.data.objects.remove(helper, do_unlink=True)

armature = next(obj for obj in bpy.data.objects if obj.type == 'ARMATURE')
for obj in [o for o in bpy.data.objects if o.type == 'MESH']:
    bpy.data.objects.remove(obj, do_unlink=True)

print('BUILD', chibi.replace_mesh(armature, design.PALETTE, design.build, MESH_NAME, hide_base=False))

mesh = bpy.data.objects[MESH_NAME].data
info = [f'{NAME}: {len(mesh.vertices)} 顶点 / {len(mesh.polygons)} 面 / {len(bpy.data.actions)} 动作']
info.append('身高 ' + str(round(max(v.co.z for v in mesh.vertices), 4)))
print('INFO', ' / '.join(info))

TARGET.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for object_name in (armature.name, MESH_NAME):
    bpy.data.objects[object_name].select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(TARGET),
    export_format='GLB',
    use_selection=True,
    export_skins=True,
    export_yup=True,
    export_apply=False,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_bake_animation=False,
    export_force_sampling=True,
    export_optimize_animation_size=False,
)
# 顺手存一份 GUI 调形用的工作文件：骨架改成 character-<名字>，live_rebuild/export_live 才认得
# （重命名放在导出之后，GLB 里的骨架名与其它角色保持一致）
BLEND = ROOT / 'assets' / 'models' / 'characters' / f'{NAME}-work.blend'
armature.name = f'character-{NAME}'
armature.data.name = f'character-{NAME}'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
print('SAVED', BLEND)
print('EXPORTED', TARGET)
