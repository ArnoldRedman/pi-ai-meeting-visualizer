# 只读检查：导入 Kenney 人物 GLB，打印骨骼、动作和网格信息
# 用法：blender -b -P tools/characters/inspect.py -- <glb 路径>
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
path = args[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

print('=== objects ===')
for obj in bpy.data.objects:
    info = f'{obj.type} {obj.name!r} parent={obj.parent.name if obj.parent else None}'
    if obj.type == 'MESH':
        info += f' verts={len(obj.data.vertices)} mats={[m.name for m in obj.data.materials]}'
    print(info)

armature = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
print('=== armature ===', armature.name, 'scale', tuple(armature.scale))
for bone in armature.data.bones:
    print(f'  bone {bone.name!r} head={tuple(round(v, 5) for v in bone.head_local)} tail={tuple(round(v, 5) for v in bone.tail_local)} parent={bone.parent.name if bone.parent else None}')

# Blender 5.x 的 Action 走 layer/slot 结构，这里只统计曲线数量，不做写入
def curve_count(action):
    total = 0
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                total += len(bag.fcurves)
    return total


print('=== actions ===', len(bpy.data.actions))
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    print(f'  {action.name!r} range={tuple(round(v, 2) for v in action.frame_range)} fcurves={curve_count(action)} users={action.users} fake={action.use_fake_user}')

print('=== mesh bounds (world) ===')
for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    corners = [obj.matrix_world @ v.co for v in obj.data.vertices]
    print(f'  {obj.name}: x[{min(c.x for c in corners):.4f},{max(c.x for c in corners):.4f}] '
          f'y[{min(c.y for c in corners):.4f},{max(c.y for c in corners):.4f}] '
          f'z[{min(c.z for c in corners):.4f},{max(c.z for c in corners):.4f}]')
    print(f'  vertex groups: {[(g.name, sum(1 for v in obj.data.vertices if any(e.group == g.index and e.weight > 0 for e in v.groups))) for g in obj.vertex_groups]}')
