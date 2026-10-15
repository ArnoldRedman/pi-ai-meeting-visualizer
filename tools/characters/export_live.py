# 实时会话里导出当前角色：按骨架名推断输出的模型文件，校正视口色彩、存盘、导出 GLB
import bpy

ROOT = r'D:\pi-ai-meeting-visualizer\assets\models\characters'
armature = next((o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith('character-')), None)
if armature is None:
    raise RuntimeError('场景里没有 character-<名字> 骨架')
name = armature.name.split('character-', 1)[1]
mesh_name = f'{name}-mesh'
target = f'{ROOT}\\character-{name}.glb'
blend = f'{ROOT}\\{name}-work.blend'

# AgX 会把颜色冲淡，视口和检查渲染统一用 Standard 才看得出真实配色
bpy.context.scene.view_settings.view_transform = 'Standard'
bpy.context.scene.render.film_transparent = False
bpy.ops.wm.save_as_mainfile(filepath=blend)
print('SAVED', blend)

bpy.ops.object.select_all(action='DESELECT')
for object_name in (armature.name, mesh_name):
    obj = bpy.data.objects.get(object_name)
    if obj:
        obj.hide_set(False)
        obj.select_set(True)
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
print('EXPORTED', target)
