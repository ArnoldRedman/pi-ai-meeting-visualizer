# Grok 娘化角色：金发吸血鬼贵族
#
# 参考设定：金色双马尾、蝙蝠发饰、小皇冠、精灵耳、蓝眼，黑色哥特裙配绯红内衬、
# 白色蕾丝领与袖口、金色腰链和圆环、黑色过膝袜、黑色厚底鞋。
# 武器：右手握全尺寸 X 战斧（黑刃金边、金箍长杆、上下矛尖）。
# 按用户决定挂在右手上，代价是坐姿时手臂前摆会把斧头带成横向（会扫过桌面），这里不做规避。
#
# 身体语言沿用已定案的 Gemini（大方头、圆块面、宽松袖），保证同场角色风格一致：
#   骨骼锚点（bind 空间，与原角色一致，不可移动）：
#     腿骨 (±0.0836, 0.0288, 0.17625)   躯干骨 (0, 0.0288, 0.17625)
#     手臂 (±0.0999, 0.01725, 0.28775)  头骨   (0, 0.00236, 0.34325)
#
# 三个必须守住的边界：
#   1. 裙子是黑色，参考图也几乎全黑，所以黑要分档：裙子最深、蝴蝶结/袜次之、厚底最浅一档的对比
#   2. 主裙摆下沿在 z 0.167，绯红内衬垂到 z 0.137 就把腿包住，袜口的蕾丝必须退到 z 0.137 以下才看得见
#   3. 双马尾下段要挂在袖子后面：袖子占 y ≤ 0.088，马尾 z < 0.45 之后必须走到 y ≥ 0.10
#      袜子比裙子浅一档，否则走路交叉时两条腿会和黑裙摆糊成一团
import math

from chibi import box, limb, poly, slab, sphere, star, strand, wedge

PALETTE = {
    'skin': (0.976, 0.886, 0.855),
    'blush': (0.949, 0.667, 0.729),
    'hair': (0.937, 0.835, 0.643),
    'hair-tip': (0.980, 0.933, 0.812),
    'dress': (0.145, 0.133, 0.180),
    'accent': (0.267, 0.243, 0.310),
    'stocking': (0.310, 0.282, 0.318),
    'sole': (0.086, 0.078, 0.106),
    'crimson': (0.478, 0.075, 0.161),
    'lace': (0.949, 0.945, 0.965),
    'gold': (0.878, 0.741, 0.400),
    'eye-blue': (0.310, 0.573, 0.945),
    'eye-dark': (0.129, 0.153, 0.310),
    'mouth': (0.722, 0.267, 0.322),
    'mouth-dark': (0.290, 0.086, 0.129),
    'shine': (1.0, 1.0, 1.0),
}


# 武器只能刚性绑在 arm-right 上，位置写在骨骼绑定空间里：手掌心 (-0.385, -0.012)
# 两处硬约束（场景 fitModel 按包围盒居中并按高度缩放到 1.35）：
#   1. 斧尖必须留在头顶 0.8174 以下，超出就会拉高包围盒、让整个人被缩小
#   2. 刃尖只能比手多伸出一点点，横向包围盒变宽会把她从座椅中心顶偏
AXE_X = -0.355
AXE_Y = -0.012
AXE_HUB = 0.600
AXE_BAR = 0.215  # 中间 X 标志两根交叉杆的长度
AXE_BAR_W = 0.058  # 交叉杆宽度


def sheet(bm, points, y, thickness=0.018):
    """若干 (x, z) 顶点围成的薄片，自动取重心；做蝙蝠翼和蝴蝶结缎带"""
    cx = sum(x for x, _ in points) / len(points)
    cz = sum(z for _, z in points) / len(points)
    poly(bm, (cx, y, cz), [(x - cx, z - cz) for x, z in points], thickness)


def ribbon(bm, cx, cz, y, size=1.0, thickness=0.016):
    """蝴蝶结：四片三角缎带围着一个结，正面看成弓形"""
    for sx in (1, -1):
        for sz in (1, -1):
            sheet(bm, [(cx, cz), (cx + sx * 0.041 * size, cz + sz * 0.069 * size),
                       (cx + sx * 0.075 * size, cz + sz * 0.008 * size)], y, thickness)
    box(bm, (cx, y, cz), (0.028 * size, thickness * 1.8, 0.028 * size))


def bead_ring(bm, center, radius, size, count=8):
    """一圈小金珠：低模没有圆环，用珠子围成一圈更像原设定的金环"""
    cx, cy, cz = center
    for i in range(count):
        angle = 2 * math.pi * i / count
        box(bm, (cx + math.cos(angle) * radius, cy, cz + math.sin(angle) * radius), (size, size, size))


def axe_bite(bm, center, side, depth, y, scale=1.0):
    """战斧的一片月牙刃：外缘外凸、内缘内凹、上下收成尖角；轮廓在 XZ 平面、沿 Y 挤出"""
    cx, cz = center
    profile = [(0.020, 0.185), (0.075, 0.158), (0.110, 0.100), (0.138, 0.0), (0.110, -0.100),
               (0.075, -0.158), (0.020, -0.185), (0.055, -0.080), (0.098, 0.0), (0.055, 0.080)]
    sheet(bm, [(cx + side * x * scale, cz + z * scale) for x, z in profile], y, depth)


def build(builder):
    bm = builder.bm

    # ---------------- 腿：黑色过膝袜 + 黑色厚底鞋 + 金环扣 ----------------
    for sign in (1, -1):
        bone = f'leg-{"left" if sign > 0 else "right"}'
        x = 0.0836 * sign
        with builder.part(bone, 'stocking'):
            box(bm, (x, -0.008, 0.138), (0.115, 0.148, 0.104))
        with builder.part(bone, 'lace'):
            # 袜口蕾丝压到 z 0.116..0.134，再高就被绯红内衬包住了
            box(bm, (x, -0.004, 0.128), (0.120, 0.152, 0.018))
        with builder.part(bone, 'accent'):
            box(bm, (x, -0.016, 0.088), (0.126, 0.168, 0.014))  # 吊袜带
            box(bm, (x, -0.014, 0.100), (0.128, 0.172, 0.010))  # 脚踝绑带
        with builder.part(bone, 'dress'):
            box(bm, (x, -0.024, 0.058), (0.116, 0.180, 0.056))
        with builder.part(bone, 'sole'):
            box(bm, (x, -0.030, 0.015), (0.132, 0.204, 0.030))  # 厚底
        with builder.part(bone, 'gold'):
            bead_ring(bm, (x, -0.120, 0.062), 0.018, 0.009)  # 鞋面金环

    # ---------------- 躯干：黑色紧身上衣 + 绯红胸口 + 蕾丝领口 ----------------
    with builder.part('torso', 'dress'):
        box(bm, (0, -0.005, 0.275), (0.27, 0.215, 0.16))
    with builder.part('torso', 'lace'):
        box(bm, (0, -0.012, 0.345), (0.288, 0.20, 0.05))
        box(bm, (0, -0.116, 0.352), (0.150, 0.014, 0.022))  # 领口白蕾丝条  # 露肩蕾丝边，比上衣宽一点才露出来
    with builder.part('torso', 'crimson'):
        box(bm, (0, -0.118, 0.310), (0.104, 0.012, 0.022))  # 领口下的绯红内衬
    with builder.part('torso', 'dress'):
        ribbon(bm, 0, 0.330, -0.126, 0.50)  # 领口黑蝴蝶结
    with builder.part('torso', 'gold'):
        bead_ring(bm, (0, -0.130, 0.286), 0.022, 0.010)  # 蝴蝶结下的金环
        star(bm, (0, -0.128, 0.260), 0.020, 0.008, 0.012, points=4)  # 金色菱形吊饰

    # ---------------- 躯干：高腰黑裙 + 后拖尾 + 绯红内衬 + 金链 ----------------
    with builder.part('torso', 'dress'):
        slab(bm, (0, -0.005, 0.212), (0.365, 0.290), (0.295, 0.240), 0.090)  # 主裙
        slab(bm, (0, 0.075, 0.200), (0.312, 0.172), (0.292, 0.162), 0.110)  # 后拖尾，比前摆低
    with builder.part('torso', 'crimson'):
        slab(bm, (0, -0.005, 0.155), (0.376, 0.302), (0.368, 0.294), 0.036)  # 前摆绯红内衬
        slab(bm, (0, 0.075, 0.148), (0.246, 0.152), (0.306, 0.170), 0.040)  # 后摆绯红内衬
    with builder.part('torso', 'gold'):
        box(bm, (0, -0.118, 0.252), (0.216, 0.012, 0.014))  # 腰部金链
        bead_ring(bm, (0.088, -0.122, 0.278), 0.028, 0.011)  # 腰侧金环
        star(bm, (0.108, -0.126, 0.228), 0.022, 0.009, 0.012, points=4)  # 金链吊饰
        star(bm, (-0.096, -0.126, 0.234), 0.018, 0.007, 0.012, points=4)
    with builder.part('torso', 'accent'):
        ribbon(bm, 0, 0.215, 0.162, 0.9)  # 背后大蝴蝶结
    with builder.part('torso', 'gold'):
        box(bm, (0, 0.166, 0.215), (0.040, 0.040, 0.040))  # 蝴蝶结金结

    # ---------------- 手臂：黑色长袖 + 白蕾丝袖口 + 露肩蕾丝 ----------------
    for sign in (1, -1):
        bone = f'arm-{"left" if sign > 0 else "right"}'
        with builder.part(bone, 'accent'):
            # 袖子用浅一档的黑：整身全黑会把同样全黑的袖子吃掉，手臂就只剩悬空的手
            box(bm, (0.170 * sign, -0.012, 0.288), (0.165, 0.200, 0.185))
        with builder.part(bone, 'lace'):
            box(bm, (0.262 * sign, -0.012, 0.288), (0.032, 0.204, 0.190))  # 袖口蕾丝
            box(bm, (0.170 * sign, -0.070, 0.378), (0.174, 0.090, 0.014))  # 肩头蕾丝压边：只压前上方，盖整条袖子会把袖子也藏了  # 肩上蕾丝
        with builder.part(bone, 'skin'):
            box(bm, (0.325 * sign, -0.012, 0.288), (0.085, 0.150, 0.130))
            box(bm, (0.385 * sign, -0.012, 0.288), (0.090, 0.130, 0.132))
            box(bm, (0.352 * sign, -0.078, 0.300), (0.045, 0.050, 0.052))

    # ---------------- 武器：X 战斧（右手） ----------------
    # 斧子只能跟着手臂动：坐姿动画把右手臂前摆约 60°，斧头会跟着倒成横向扫过桌面，
    # 这是用户对照参考图后接受的代价，不要为了“好看”把它改挂到背上
    # 形状上踩过的坑：四片细刃从斧心放射会读成四角星（像法杖）。参考图是两片月牙刃夹着中间的 X 标志，
    # 刃是横着长的（不是斜的），X 标志的四个角伸进月牙的内凹处，中间留空
    with builder.part('arm-right', 'accent'):
        box(bm, (AXE_X, AXE_Y, 0.406), (0.032, 0.032, 0.662))  # 长杆，从下端矛尖穿到上端矛尖
    with builder.part('arm-right', 'gold'):
        for z in (0.115, 0.200):
            box(bm, (AXE_X, AXE_Y, z), (0.044, 0.044, 0.020))  # 金箍
    with builder.part('arm-right', 'dress'):
        wedge(bm, (AXE_X, AXE_Y, 0.082), (0.034, 0.036), 0.062, 0.034, rot=(180, 0, 0))  # 下端矛尖，尖到 z 0.005
        wedge(bm, (AXE_X, AXE_Y, 0.735), (0.038, 0.038), 0.054, 0.038)  # 上端矛尖，尖到 z 0.800
    with builder.part('arm-right', 'gold'):
        for side in (1, -1):
            axe_bite(bm, (AXE_X, AXE_HUB), side, 0.020, AXE_Y, 1.06)  # 月牙刃的金描边，比黑刃大一圈
        for angle in (45, -45):
            box(bm, (AXE_X, AXE_Y, AXE_HUB), (AXE_BAR, 0.020, AXE_BAR_W), rot=(0, angle, 0))  # X 标志的金描边
    with builder.part('arm-right', 'dress'):
        for side in (1, -1):
            axe_bite(bm, (AXE_X, AXE_HUB), side, 0.030, AXE_Y)  # 两片黑月牙刃
        for angle in (45, -45):
            box(bm, (AXE_X, AXE_Y, AXE_HUB), (AXE_BAR - 0.018, 0.030, AXE_BAR_W - 0.016), rot=(0, angle, 0))
        box(bm, (AXE_X, AXE_Y, AXE_HUB), (0.058, 0.026, 0.058), rot=(0, 45, 0))  # 斧心补成实心菱形
    with builder.part('arm-right', 'gold'):
        star(bm, (AXE_X, AXE_Y - 0.018, AXE_HUB), 0.024, 0.010, 0.014, points=4)  # 正面中心金十字
        star(bm, (AXE_X, AXE_Y + 0.018, AXE_HUB), 0.024, 0.010, 0.014, points=4)  # 背面同一个

    # ---------------- 头：极浅肤色 + 蓝色大眼 + 獠牙 ----------------
    with builder.part('head', 'skin'):
        box(bm, (0, -0.028, 0.505), (0.30, 0.245, 0.30))
        box(bm, (0, -0.02, 0.352), (0.10, 0.10, 0.04))
    for sign in (1, -1):
        with builder.part('head', 'eye-dark'):
            box(bm, (0.062 * sign, -0.152, 0.505), (0.090, 0.014, 0.100))
        with builder.part('head', 'eye-blue'):
            box(bm, (0.062 * sign, -0.158, 0.504), (0.066, 0.012, 0.078))
        with builder.part('head', 'shine'):
            box(bm, (0.076 * sign, -0.163, 0.528), (0.024, 0.010, 0.026))
    with builder.part('head', 'mouth'):
        box(bm, (0, -0.152, 0.434), (0.044, 0.014, 0.018))
    with builder.part('head', 'mouth-dark'):
        box(bm, (0, -0.161, 0.434), (0.028, 0.012, 0.012))  # 张口的内腔
    with builder.part('head', 'shine'):
        box(bm, (0.015, -0.165, 0.4265), (0.009, 0.009, 0.020))  # 吸血鬼獠牙
        box(bm, (-0.015, -0.165, 0.4265), (0.009, 0.009, 0.020))
    with builder.part('head', 'blush'):
        box(bm, (0.118, -0.152, 0.462), (0.055, 0.012, 0.032))
        box(bm, (-0.118, -0.152, 0.462), (0.055, 0.012, 0.032))

    # ---------------- 头发：金色刘海 + 后发 + 双马尾 + 呆毛 ----------------
    with builder.part('head', 'hair'):
        box(bm, (0, -0.115, 0.635), (0.335, 0.09, 0.08))
        box(bm, (0, 0.005, 0.687), (0.33, 0.30, 0.135))
        box(bm, (0, 0.152, 0.560), (0.29, 0.125, 0.40))
        box(bm, (0.152, -0.055, 0.520), (0.06, 0.21, 0.28))
        box(bm, (-0.152, -0.055, 0.520), (0.06, 0.21, 0.28))
    # 双马尾：贴着发盖往下挂，从 z 0.45 起退到 y ≥ 0.10，避开 y ≤ 0.088 的袖子
    for sign in (1, -1):
        with builder.part('head', 'hair'):
            limb(bm, (0.160 * sign, 0.050, 0.650), (0.205 * sign, 0.078, 0.545), 0.074, 0.070)
            limb(bm, (0.205 * sign, 0.078, 0.545), (0.212 * sign, 0.108, 0.450), 0.070, 0.062)
            limb(bm, (0.212 * sign, 0.108, 0.450), (0.204 * sign, 0.124, 0.360), 0.062, 0.054)
        # 发梢往外甩一下，参考图的马尾末端是往外翻的
        with builder.part('head', 'hair-tip'):
            limb(bm, (0.204 * sign, 0.124, 0.360), (0.238 * sign, 0.134, 0.302), 0.054, 0.034)
            sphere(bm, (0.242 * sign, 0.135, 0.298), 0.030, 1)
    with builder.part('head', 'hair'):
        strand(bm, [(0.0, -0.035, 0.776), (0.0, -0.092, 0.806), (0.028, -0.140, 0.818)],
               0.030, 0.017, 0.024, tip=0.026)  # 呆毛

    # ---------------- 发饰：两侧蝴蝶结、左侧蝙蝠翼、头顶小皇冠 ----------------
    for sign in (1, -1):
        with builder.part('head', 'accent'):
            ribbon(bm, 0.196 * sign, 0.664, 0.030, 0.95)
        with builder.part('head', 'gold'):
            sphere(bm, (0.196 * sign, 0.030, 0.664), 0.011, 1)
    # 蝙蝠翼只戴在 +x（她的左侧，与参考图一致），面片落在发盖之外、马尾之前
    with builder.part('head', 'accent'):
        y = -0.050
        root = (0.166, 0.706)
        upper = (0.238, 0.766)
        outer = (0.302, 0.744)
        scallop = (0.262, 0.700)
        lower = (0.212, 0.664)
        sheet(bm, [root, upper, outer], y, 0.020)
        sheet(bm, [root, outer, scallop], y, 0.020)
        sheet(bm, [root, scallop, lower], y, 0.020)
    with builder.part('head', 'accent'):
        box(bm, (0, -0.045, 0.760), (0.150, 0.118, 0.040))  # 冠座
    with builder.part('head', 'gold'):
        box(bm, (0, -0.045, 0.782), (0.156, 0.124, 0.014))  # 金边
        sheet(bm, [(0.0, 0.784), (0.030, 0.820), (0.060, 0.784)], -0.045, 0.022)  # 中冠尖
        for dx in (-0.055, 0.055):
            wedge(bm, (dx, -0.045, 0.788), (0.030, 0.010), 0.026, 0.022)

    # ---------------- 精灵耳：向后上方伸出的尖耳 ----------------
    for sign in (1, -1):
        with builder.part('head', 'skin'):
            strand(bm, [(0.140 * sign, -0.020, 0.512), (0.196 * sign, 0.010, 0.540),
                        (0.246 * sign, 0.036, 0.566)], 0.070, 0.030, 0.042, tip=0.030)
        with builder.part('head', 'blush'):
            strand(bm, [(0.150 * sign, -0.040, 0.512), (0.212 * sign, -0.012, 0.538)],
                   0.036, 0.016, 0.014, tip=0.016)
