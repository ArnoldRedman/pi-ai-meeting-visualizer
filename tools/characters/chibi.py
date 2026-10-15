# 低多边形角色几何库：基本体、部位登记、材质与顶点组装配、实时替换网格
#
# 所有几何都在 bind 空间里构建（Z 向上、脸朝 -Y），与 Kenney 角色同一套坐标，
# 每个部位刚性绑定到一根骨头，因此原骨架的 32 个动作可以原样使用
# 调色板取值既可以是 RGB 元组，也可以是图片路径（贴花材质，带透明通道）
import math

import bmesh
import bpy
from mathutils import Euler, Vector

BEVEL_WIDTH = 0.005


def _rotation(rot):
    return Euler([math.radians(a) for a in rot]).to_matrix() if rot else None


def _write(bm, verts, faces, center, rot):
    matrix = _rotation(rot)
    origin = Vector(center)
    created = []
    for vert in verts:
        point = Vector(vert)
        if matrix:
            point = origin + matrix @ (point - origin)
        created.append(bm.verts.new(point))
    for face in faces:
        bm.faces.new([created[i] for i in face])
    return created


def box(bm, center, size, rot=None):
    """长方体"""
    x, y, z = (s / 2 for s in size)
    cx, cy, cz = center
    verts = [(cx - x, cy - y, cz - z), (cx + x, cy - y, cz - z), (cx + x, cy + y, cz - z), (cx - x, cy + y, cz - z),
             (cx - x, cy - y, cz + z), (cx + x, cy - y, cz + z), (cx + x, cy + y, cz + z), (cx - x, cy + y, cz + z)]
    return _write(bm, verts, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], center, rot)


def slab(bm, center, bottom, top, height, rot=None):
    """上下尺寸不同的方台，做躯干收腰、裙摆、靴筒"""
    bx, by = (s / 2 for s in bottom)
    tx, ty = (s / 2 for s in top)
    cx, cy, cz = center
    z0, z1 = cz - height / 2, cz + height / 2
    verts = [(cx - bx, cy - by, z0), (cx + bx, cy - by, z0), (cx + bx, cy + by, z0), (cx - bx, cy + by, z0),
             (cx - tx, cy - ty, z1), (cx + tx, cy - ty, z1), (cx + tx, cy + ty, z1), (cx - tx, cy + ty, z1)]
    return _write(bm, verts, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], center, rot)


def wedge(bm, center, base, height, depth, rot=None):
    """三角柱，尖角朝上（猫耳、发梢、裙摆尖角）"""
    bx, bz = base[0] / 2, base[1] / 2
    dy = depth / 2
    cx, cy, cz = center
    verts = [(cx - bx, cy - dy, cz), (cx + bx, cy - dy, cz), (cx, cy - dy, cz + bz + height),
             (cx - bx, cy + dy, cz), (cx + bx, cy + dy, cz), (cx, cy + dy, cz + bz + height)]
    return _write(bm, verts, [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], center, rot)


def poly(bm, center, profile, depth, rot=None):
    """任意凸多边形沿 Y 挤出（轮廓写在 XZ 平面），做刘海、脸、裙片、眼睛"""
    dy = depth / 2
    cx, cy, cz = center
    verts = []
    for x, z in profile:
        verts.append((cx + x, cy - dy, cz + z))
        verts.append((cx + x, cy + dy, cz + z))
    count = len(profile)
    faces = [tuple(i * 2 for i in range(count))[::-1], tuple(i * 2 + 1 for i in range(count))]
    faces += [(i * 2, i * 2 + 1, ((i + 1) % count) * 2 + 1, ((i + 1) % count) * 2) for i in range(count)]
    return _write(bm, verts, faces, center, rot)


def star(bm, center, outer, inner, depth, points=5, rot=None):
    """薄五角星"""
    dy = depth / 2
    cx, cy, cz = center
    verts = []
    for i in range(points * 2):
        radius = outer if i % 2 == 0 else inner
        angle = math.pi / 2 + i * math.pi / points
        verts.append((cx + math.cos(angle) * radius, cy - dy, cz + math.sin(angle) * radius))
        verts.append((cx + math.cos(angle) * radius, cy + dy, cz + math.sin(angle) * radius))
    count = points * 2
    faces = [tuple(i * 2 for i in range(count))[::-1], tuple(i * 2 + 1 for i in range(count))]
    faces += [(i * 2, i * 2 + 1, ((i + 1) % count) * 2 + 1, ((i + 1) % count) * 2) for i in range(count)]
    return _write(bm, verts, faces, center, rot)


def sphere(bm, center, radius, subdivisions=1, scale=(1, 1, 1)):
    """低面数球，做发团、尾巴尖"""
    result = bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    for vert in result['verts']:
        vert.co = Vector((vert.co.x * scale[0], vert.co.y * scale[1], vert.co.z * scale[2])) + Vector(center)
    return result['verts']


def limb(bm, start, end, radius_a, radius_b, segments=8):
    """两点之间的锥形柱（手臂、腿、尾巴、发束），端面封口"""
    head, tail = Vector(start), Vector(end)
    axis = (tail - head).normalized()
    helper = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    side = axis.cross(helper).normalized()
    up = side.cross(axis).normalized()
    rings = []
    for point, radius in ((head, radius_a), (tail, radius_b)):
        ring = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            offset = side * math.cos(angle) * radius + up * math.sin(angle) * radius
            ring.append(bm.verts.new(point + offset))
        rings.append(ring)
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new([rings[0][i], rings[0][j], rings[1][j], rings[1][i]])
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[1])
    return rings[0] + rings[1]


def ring_points(rx, ry, corner=0.42):
    """带圆角的矩形截面（八点）：corner 越小越方，越大越接近椭圆"""
    cx, cy = rx * corner, ry * corner
    return [(-rx + cx, -ry), (rx - cx, -ry), (rx, -ry + cy), (rx, ry - cy),
            (rx - cx, ry), (-rx + cx, ry), (-rx, ry - cy), (-rx, -ry + cy)]


def loft(bm, rings, center=(0, 0, 0), corner=0.42, rot=None):
    """多层截面叠成的旋转体：rings 为 (z, 半宽, 半深) 列表，做头骨、躯干、裙摆、靴筒"""
    cx, cy, cz = center
    layers = []
    for z, rx, ry in rings:
        layers.append([bm.verts.new((cx + x, cy + y, cz + z)) for x, y in ring_points(rx, ry, corner)])
    segments = len(layers[0])
    for lower, upper in zip(layers, layers[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new([lower[i], lower[j], upper[j], upper[i]])
    bm.faces.new(layers[0][::-1])
    bm.faces.new(layers[-1])
    created = [vert for layer in layers for vert in layer]
    if rot:
        matrix = _rotation(rot)
        origin = Vector(center)
        for vert in created:
            vert.co = origin + matrix @ (vert.co - origin)
    return created


def strand(bm, spine, width_start, width_end, thickness=0.008, tip=0.0):
    """沿折线生成一片带厚度的锥形发片：spine 为 (x, y, z) 列表，tip 为末端延伸长度（0 则封口）"""
    count = len(spine)
    layers = []
    for index, point in enumerate(spine):
        ratio = index / (count - 1)
        half = (width_start + (width_end - width_start) * ratio) / 2
        thick = thickness / 2
        x, y, z = point
        layers.append([bm.verts.new(corner) for corner in
                       ((x - half, y - thick, z), (x + half, y - thick, z), (x + half, y + thick, z), (x - half, y + thick, z))])
    for lower, upper in zip(layers, layers[1:]):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new([lower[i], lower[j], upper[j], upper[i]])
    bm.faces.new(layers[0][::-1])
    if tip > 0:
        last = spine[-1]
        apex = bm.verts.new((last[0], last[1], last[2] - tip))
        for i in range(4):
            bm.faces.new([layers[-1][i], layers[-1][(i + 1) % 4], apex])
    else:
        bm.faces.new(layers[-1])
    return [vert for layer in layers for vert in layer]


def plane(bm, center, width, height, rot=None):
    """朝 -Y 的矩形贴花面片：UV 铺满整张图，用来把标志贴图贴到角色身上"""
    half_w, half_h = width / 2, height / 2
    matrix = _rotation(rot)
    origin = Vector(center)
    created = []
    for corner, uv in (((-half_w, 0, half_h), (0, 1)), ((half_w, 0, half_h), (1, 1)),
                       ((half_w, 0, -half_h), (1, 0)), ((-half_w, 0, -half_h), (0, 0))):
        point = Vector(corner)
        if matrix:
            point = matrix @ point
        created.append((bm.verts.new(origin + point), uv))
    face = bm.faces.new([vertex for vertex, _ in created])
    layer = bm.loops.layers.uv.verify()
    for loop, (_, uv) in zip(face.loops, created):
        loop[layer].uv = uv
    return [vertex for vertex, _ in created]


class Builder:
    """按部位记录顶点／面区间，最后一次性写进顶点组和材质槽"""

    def __init__(self, palette):
        self.bm = bmesh.new()
        self.palette = palette
        self.parts = []
        self._bone = self._material = None

    def part(self, bone, material):
        self._bone, self._material = bone, material
        return self

    def __enter__(self):
        self._start = (len(self.bm.verts), len(self.bm.faces))
        return self

    def __exit__(self, *_):
        start_vert, start_face = self._start
        self.parts.append((self._bone, self._material, start_vert, len(self.bm.verts), start_face, len(self.bm.faces)))

    def finish(self, mesh_name='character-mesh'):
        """转成 Blender 网格：每个部位的面写入材质槽，倒角交给对象级修改器"""
        self.bm.verts.ensure_lookup_table()
        self.bm.faces.ensure_lookup_table()
        materials = list(self.palette)
        for _, material, _, _, face_start, face_end in self.parts:
            for face in self.bm.faces[face_start:face_end]:
                face.material_index = materials.index(material)
        # 统一重算外向法线：镜像的轮廓/薄片不会因为绕向翻面而在浏览器里被背面剔除
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(mesh_name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for name, color in self.palette.items():
            slot = f'{mesh_name}-{name}'
            material = bpy.data.materials.get(slot) or bpy.data.materials.new(slot)
            material.use_nodes = True
            shader = material.node_tree.nodes['Principled BSDF']
            shader.inputs['Roughness'].default_value = 0.6
            shader.inputs['Metallic'].default_value = 0.0
            if isinstance(color, str):
                # 贴图材质：调色板里写图片路径，颜色和透明度都来自贴图（带透明通道的贴花）
                image = bpy.data.images.load(color, check_existing=True)
                image.pack()
                texture = material.node_tree.nodes.new('ShaderNodeTexImage')
                texture.image = image
                links = material.node_tree.links
                links.new(texture.outputs['Color'], shader.inputs['Base Color'])
                links.new(texture.outputs['Alpha'], shader.inputs['Alpha'])
                if hasattr(material, 'surface_render_method'):
                    material.surface_render_method = 'BLENDED'
                else:
                    material.blend_method = 'BLEND'
                material.diffuse_color = (0, 0, 0, 1)
            else:
                shader.inputs['Base Color'].default_value = (*color, 1)
                material.diffuse_color = (*color, 1)
            mesh.materials.append(material)
        return mesh


def replace_mesh(armature, palette, build, mesh_name='character-mesh', hide_base=True):
    """删掉旧网格、按设计重建并挂到骨架上；返回统计文本"""
    scene = bpy.context.scene
    existing = bpy.data.objects.get(mesh_name)
    if existing:
        old = existing.data
        bpy.data.objects.remove(existing, do_unlink=True)
        bpy.data.meshes.remove(old)
    if hide_base:
        for obj in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith('-base')]:
            obj.hide_set(True)
            obj.hide_render = True

    builder = Builder(palette)
    build(builder)
    obj = bpy.data.objects.new(mesh_name, builder.finish(mesh_name))
    scene.collection.objects.link(obj)
    # 先按部位范围写顶点组，倒角继承权重（新建的顶点由相邻顶点插值得到）
    for bone, _, vert_start, vert_end, _, _ in builder.parts:
        group = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
        group.add(list(range(vert_start, vert_end)), 1.0, 'REPLACE')

    bevel = obj.modifiers.new('bevel', 'BEVEL')
    bevel.width = BEVEL_WIDTH
    bevel.segments = 1
    # 只削真正的硬边，圆弧截面保持原样
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(28)
    bevel.use_clamp_overlap = True
    # 用依赖图求值代替操作符，实时会话和后台模式都不需要上下文
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated)
    obj.modifiers.clear()
    base = obj.data
    obj.data = mesh
    bpy.data.meshes.remove(base)

    modifier = obj.modifiers.new('armature', 'ARMATURE')
    modifier.object = armature
    obj.parent = armature
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    # 材质预览模式让颜色直接可见；网格使用绝对坐标，骨架实例保持原点
    for area in getattr(bpy.context.screen, 'areas', []):
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.type = 'MATERIAL'
    stats = [f'{len(mesh.vertices)} 顶点 / {len(mesh.polygons)} 面 / {len(builder.parts)} 部位']
    for bone in [b.name for b in armature.data.bones]:
        group = obj.vertex_groups.get(bone)
        count = sum(1 for v in mesh.vertices if group and any(e.group == group.index and e.weight > 0 for e in v.groups))
        stats.append(f'{bone}={count}')
    return ' | '.join(stats)
