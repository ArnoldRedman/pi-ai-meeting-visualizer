# 量每个顶点组的包围盒，并按坐标切分部位块（用来对齐新模型的尺寸）
# 用法：blender -b --factory-startup -P tools/characters/measure.py -- <glb>
import sys
from collections import defaultdict

import bpy

path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

for obj in [o for o in bpy.data.objects if o.type == 'MESH' and o.name != 'Icosphere']:
    print(f'=== {obj.name} ===')
    groups = defaultdict(list)
    for vertex in obj.data.vertices:
        for element in vertex.groups:
            if element.weight > 0:
                groups[obj.vertex_groups[element.group].name].append(obj.matrix_world @ vertex.co)
    for name, points in sorted(groups.items()):
        xs = sorted(p.x for p in points)
        ys = sorted(p.y for p in points)
        zs = sorted(p.z for p in points)
        print(f'  {name}: n={len(points)} '
              f'x[{xs[0]:.4f},{xs[-1]:.4f}] y[{ys[0]:.4f},{ys[-1]:.4f}] z[{zs[0]:.4f},{zs[-1]:.4f}]')
        # 沿最长轴看坐标断层，用来找部位分块边界
        span = {'x': xs[-1] - xs[0], 'y': ys[-1] - ys[0], 'z': zs[-1] - zs[0]}
        axis = max(span, key=span.get)
        values = {'x': xs, 'y': ys, 'z': zs}[axis]
        gaps, hit = [], False
        for i in range(1, len(values)):
            if values[i] - values[i - 1] > 0.012:
                gaps.append(f'{(values[i] + values[i - 1]) / 2:.4f}')
        print(f'     最长轴 {axis} 断层(>{0.012}): {gaps or "无"}')
