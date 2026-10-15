# 渲染人物预览图：正/侧/背/三视角 + 若干动作帧 + 四视角拼图
# 用法：blender -b --factory-startup -P tools/characters/preview.py -- <glb> <输出目录> [引擎] [尺寸]
import math
import os
import shutil
import subprocess
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
# 一律转绝对路径：相对路径会被 Blender 解析到盘符根目录（渲染图会悄悄写到 C:\assets\...，
# 仓库里的旧图不动，后面拼出来的 4v.png 就被旧图蒙混过去
glb, out_dir = os.path.abspath(argv[0]), os.path.abspath(argv[1])
engine = argv[2] if len(argv) > 2 else 'BLENDER_EEVEE'
size = int(argv[3]) if len(argv) > 3 else 640
os.makedirs(out_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)

# 导入器会额外生成一个 Icosphere 作为骨骼显示形状，不属于模型
helper = bpy.data.objects.get('Icosphere')
if helper:
    bpy.data.objects.remove(helper, do_unlink=True)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
armature = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
corners = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
center = (low + high) / 2
height = high.z - low.z

print(f'=== bounds low={tuple(round(v, 4) for v in low)} high={tuple(round(v, 4) for v in high)} height={height:.4f}')
if armature.animation_data:
    print('=== animation_data action:', armature.animation_data.action)

# 地面与灯光：只用于预览，不写回模型
bpy.ops.mesh.primitive_plane_add(size=height * 6, location=(center.x, center.y, low.z))
floor = bpy.context.object
floor.name = 'preview-floor'
floor_material = bpy.data.materials.new('preview-floor')
floor_material.diffuse_color = (0.62, 0.60, 0.58, 1)
floor.data.materials.append(floor_material)

bpy.ops.object.light_add(type='SUN', location=(2, -2, 4))
sun = bpy.context.object
sun.data.energy = 2.2
sun.rotation_euler = (math.radians(48), 0, math.radians(35))

world = bpy.data.worlds.new('preview-world')
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.45, 0.44, 0.47, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.40

bpy.ops.object.camera_add()
camera = bpy.context.object
bpy.context.scene.camera = camera
camera.data.type = 'ORTHO'
camera.data.ortho_scale = height * 1.25

scene = bpy.context.scene
scene.render.engine = engine
scene.render.resolution_x = size
scene.render.resolution_y = int(size * 1.35)
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'


def aim(azimuth_deg, elevation_deg=0.0):
    distance = height * 4
    azimuth = math.radians(azimuth_deg)
    elevation = math.radians(elevation_deg)
    direction = Vector((math.sin(azimuth), -math.cos(azimuth), math.sin(elevation)))
    camera.location = center + direction * distance
    camera.rotation_euler = (math.radians(90) - elevation, 0, azimuth)


def set_action(name, frame):
    if not armature.animation_data:
        armature.animation_data_create()
    action = bpy.data.actions.get(name)
    if action is None:
        print(f'!! 没有动作 {name}')
        return
    armature.animation_data.action = action
    slot = getattr(action, 'slots', None)
    if slot:
        armature.animation_data.action_slot = action.slots[0]
    scene.frame_set(int(frame))


def rest_pose():
    """四视角要看的是静置外形：导入 glTF 时会自动挂上一个动作，必须先清掉再复位骨骼"""
    if armature.animation_data:
        armature.animation_data.action = None
    for bone in armature.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)
    scene.frame_set(1)
    bpy.context.view_layer.update()


def shot(name, azimuth, elevation=0.0):
    aim(azimuth, elevation)
    scene.render.filepath = os.path.join(out_dir, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print(f'=== rendered {scene.render.filepath}')


rest_pose()
for label, azimuth in (('front', 0), ('side', 90), ('back', 180), ('quarter', 35)):
    shot(label, azimuth, 6)
shot('top', 0, 55)
set_action('sit', 4)
shot('sit', 35, 6)
set_action('walk', 4)
shot('walk', 35, 6)
set_action('interact-right', 8)
shot('interact', 35, 6)

# 四视角拼图：README 里放这一张就够
views = [os.path.join(out_dir, f'{name}.png') for name in ('front', 'quarter', 'side', 'back')]
target = os.path.join(out_dir, '4v.png')
if shutil.which('ffmpeg'):
    inputs = [arg for view in views for arg in ('-i', view)]
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', 'hstack=4', target], check=True)
    print(f'=== 四视角拼图 {target}')
else:
    print('!! 没找到 ffmpeg，跳过四视角拼图（装好 ffmpeg 后重跑本脚本）')
