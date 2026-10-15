# 实时重建：按场景里的骨架名推断角色，重跑设计并挂回骨架，同时量出入座高度常量
# 用法（MCP execute_blender_code 的 payload，也可 blender -b -P 直接跑）
import importlib
import sys

import bpy

DIR = r'D:\pi-ai-meeting-visualizer\tools\characters'
if DIR not in sys.path:
    sys.path.insert(0, DIR)

armature = next((o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith('character-')), None)
if armature is None:
    raise RuntimeError('场景里没有 character-<名字> 骨架，先跑 prepare_scene.py')
name = armature.name.split('character-', 1)[1]
mesh_name = f'{name}-mesh'
# 清掉模块缓存，改动设计脚本后立刻生效
for module_name in ('chibi', name):
    sys.modules.pop(module_name, None)
chibi = importlib.import_module('chibi')
design = importlib.import_module(name)
print('REBUILD', chibi.replace_mesh(armature, design.PALETTE, design.build, mesh_name))

scene = bpy.context.scene
mesh = bpy.data.objects[mesh_name].data
height = max(vertex.co.z for vertex in mesh.vertices)
print('CHARACTER', name, '| BIND_HEIGHT', round(height, 4), '| 原模型 0.7755')

if not armature.animation_data:
    armature.animation_data_create()


def pose_hip(action_name, frame):
    """返回指定动作帧上髋骨（torso 骨头）的世界高度"""
    if action_name is None:
        armature.animation_data.action = None
        scene.frame_set(1)
    else:
        action = bpy.data.actions[action_name]
        armature.animation_data.action = action
        if getattr(action, 'slots', None):
            armature.animation_data.action_slot = action.slots[0]
        scene.frame_set(frame)
    bpy.context.view_layer.update()
    return (armature.matrix_world @ armature.pose.bones['torso'].head).z


sit = pose_hip('sit', 2)
print('HIP_REST', round(pose_hip(None, 1), 4), 'HIP_SIT', round(sit, 4))

# 入座高度按"髋高占身高比例"换算：角色统一缩放到 1.35 米，比例变了就要补差
delta = sit * (1.35 / 0.7755 - 1.35 / height)
print('SUGGEST_SIT_Y', round(0.43 + delta, 3), '| 当前 0.43')
print('SUGGEST_SOFA_Y', round(0.40 + delta, 3), '| 当前 0.4')

pose_hip('static', 1)
print('READY')
