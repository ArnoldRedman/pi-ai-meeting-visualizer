# 把角色导出成 GLB：保留原骨架与全部动作，只导出骨架 + 网格
# 用法：blender -b --factory-startup -P tools/characters/export_glb.py -- <源 glb> <输出 glb>
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
source, target = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
helper = bpy.data.objects.get('Icosphere')
if helper:
    bpy.data.objects.remove(helper, do_unlink=True)

for obj in bpy.data.objects:
    obj.select_set(obj.type in {'ARMATURE', 'MESH'})

print(f'=== 导出前 {len(bpy.data.actions)} 个动作，{sum(1 for o in bpy.data.objects if o.type == "MESH")} 个网格')
bpy.ops.export_scene.gltf(
    filepath=target,
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
print(f'=== 已导出 {target}')
