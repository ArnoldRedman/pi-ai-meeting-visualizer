# Qwen 娘化角色：汉服风
#
# 参考设定：蓝紫色长发（侧辫 + 前垂发）、藏青贝雷帽（白丝带 + 金星）、淡紫蓝眼，
# 白色上襦配藏青交叉领与宽腰封、藏青披帛（肩披 + 两侧垂片）、宽袖白袖口，
# 蓝外裙叠白色内衬、藏青高跟配金星饰。
# 手袋（香囊形）照参考图补上了：它只能刚性绑在 arm-left 手骨上，横向包围盒从 ±0.43 变成
# +0.453，场景按包围盒居中会偏 0.012（Grok 的战斧是同一笔代价，比斧子小得多）。
# 折扇仍然不做：扇面比手袋宽一倍，横向会撑得更远，而且扇骨细节在这个尺寸下也留不住。
#
# 身体语言沿用已定案的 Gemini（大方头、圆块面、宽松袖），保证同场角色风格一致：
#   骨骼锚点（bind 空间，与原角色一致，不可移动）：
#     腿骨 (±0.0836, 0.0288, 0.17625)   躯干骨 (0, 0.0288, 0.17625)
#     手臂 (±0.0999, 0.01725, 0.28775)  头骨   (0, 0.00236, 0.34325)
#
# 三个必须守住的边界：
#   1. 身高要留在 0.80 上下：场景按包围盒高度缩放到 1.35，头发/帽子顶得越高，整个人越小
#   2. 主裙摆下沿在 z 0.167，白色内衬垂到 z 0.128，腿只露到 0.128 —— 鞋和脚踝都压在这条线以下
#   3. 后发和披帛都吃 y 方向的包围盒（会让她整体前后偏移），尽量贴背，别超过 y 0.22
import math

from chibi import box, limb, loft, poly, slab, sphere, star, strand, wedge

PALETTE = {
    'skin': (0.976, 0.886, 0.855),
    'blush': (0.949, 0.667, 0.729),
    'hair': (0.420, 0.470, 0.800),
    'hair-light': (0.660, 0.700, 0.930),
    'navy': (0.055, 0.060, 0.135),
    'blue': (0.175, 0.205, 0.500),
    'pale': (0.780, 0.800, 0.900),
    'white': (0.930, 0.935, 0.960),
    'gold': (0.878, 0.741, 0.400),
    'eye-violet': (0.290, 0.245, 0.690),
    'eye-dark': (0.075, 0.080, 0.190),
    'mouth': (0.722, 0.267, 0.322),
    'shine': (1.0, 1.0, 1.0),
}


def sheet(bm, points, y, thickness=0.018):
    """若干 (x, z) 顶点围成的薄片，自动取重心；做蝴蝶结缎带"""
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
    """一圈小金珠：低模没有圆环，用珠子围成一圈更像原设定的金饰"""
    cx, cy, cz = center
    for i in range(count):
        angle = 2 * math.pi * i / count
        box(bm, (cx + math.cos(angle) * radius, cy, cz + math.sin(angle) * radius), (size, size, size))


def build(builder):
    bm = builder.bm

    # ---------------- 腿：裸腿 + 藏青高跟 + 脚踝带 ----------------
    for sign in (1, -1):
        bone = f'leg-{"left" if sign > 0 else "right"}'
        x = 0.0836 * sign
        with builder.part(bone, 'skin'):
            box(bm, (x, -0.008, 0.132), (0.112, 0.145, 0.085))  # 小腿，只露到白内衬下沿
        with builder.part(bone, 'navy'):
            box(bm, (x, -0.024, 0.058), (0.116, 0.180, 0.056))  # 鞋面
            box(bm, (x, -0.028, 0.014), (0.126, 0.192, 0.028))  # 鞋底
            box(bm, (x, 0.052, 0.024), (0.044, 0.048, 0.048))  # 细高跟
        with builder.part(bone, 'pale'):
            box(bm, (x, -0.012, 0.094), (0.124, 0.166, 0.010))  # 脚踝带
        with builder.part(bone, 'gold'):
            star(bm, (x, -0.100, 0.062), 0.020, 0.008, 0.012, points=4)  # 鞋头金星（原设定标志）

    # ---------------- 躯干：白襦 + 藏青交叉领 + 宽腰封 + 披帛 ----------------
    with builder.part('torso', 'white'):
        box(bm, (0, -0.005, 0.275), (0.27, 0.215, 0.16))  # 上襦
    with builder.part('torso', 'navy'):
        box(bm, (0, -0.012, 0.346), (0.30, 0.224, 0.056))  # 肩披
        box(bm, (0, -0.005, 0.231), (0.278, 0.214, 0.030))  # 宽腰封
    with builder.part('torso', 'white'):
        box(bm, (0, -0.130, 0.330), (0.088, 0.014, 0.070))  # 披帛中间露出的白襦
    with builder.part('torso', 'blue'):
        for sign in (1, -1):
            box(bm, (0.038 * sign, -0.128, 0.316), (0.105, 0.014, 0.022), rot=(0, -22 * sign, 0))  # 交叉领
    with builder.part('torso', 'pale'):
        box(bm, (0, -0.114, 0.244), (0.20, 0.016, 0.016))  # 腰封上的浅色束带
    with builder.part('torso', 'navy'):
        ribbon(bm, 0, 0.302, -0.132, 0.50)  # 胸前蝴蝶结
    with builder.part('torso', 'gold'):
        box(bm, (0, -0.134, 0.302), (0.030, 0.030, 0.030))  # 蝴蝶结金结
        for sign in (1, -1):
            box(bm, (0.118 * sign, -0.122, 0.212), (0.018, 0.014, 0.044))  # 腰侧流苏

    # ---------------- 裙：蓝外裙 + 白内衬 + 披帛两侧垂片 ----------------
    with builder.part('torso', 'blue'):
        slab(bm, (0, -0.005, 0.212), (0.365, 0.290), (0.295, 0.240), 0.090)  # 蓝外裙
    with builder.part('torso', 'pale'):
        slab(bm, (0, -0.005, 0.152), (0.378, 0.304), (0.370, 0.296), 0.048)  # 白内衬，裙摆下沿
        slab(bm, (0, -0.136, 0.205), (0.225, 0.026), (0.150, 0.026), 0.072, rot=(-11, 0, 0))  # 正面白裙片，跟着裙面斜度
    with builder.part('torso', 'navy'):
        slab(bm, (0, 0.075, 0.200), (0.312, 0.172), (0.292, 0.162), 0.110)  # 背后垂片
        for sign in (1, -1):
            slab(bm, (0.152 * sign, -0.010, 0.205), (0.092, 0.150), (0.076, 0.136), 0.105)  # 两侧垂片

    # ---------------- 手臂：藏青宽袖 + 白袖口 ----------------
    for sign in (1, -1):
        bone = f'arm-{"left" if sign > 0 else "right"}'
        with builder.part(bone, 'navy'):
            box(bm, (0.170 * sign, -0.012, 0.288), (0.165, 0.200, 0.185))  # 宽袖
        with builder.part(bone, 'blue'):
            box(bm, (0.140 * sign, -0.012, 0.374), (0.104, 0.216, 0.030))  # 肩头浅蓝压边
            box(bm, (0.238 * sign, -0.012, 0.288), (0.016, 0.206, 0.192))  # 袖口浅蓝滚边
        with builder.part(bone, 'white'):
            box(bm, (0.262 * sign, -0.012, 0.288), (0.032, 0.204, 0.190))  # 白袖口
        with builder.part(bone, 'skin'):
            box(bm, (0.325 * sign, -0.012, 0.288), (0.085, 0.150, 0.130))
            box(bm, (0.385 * sign, -0.012, 0.288), (0.090, 0.130, 0.132))
            box(bm, (0.352 * sign, -0.078, 0.300), (0.045, 0.050, 0.052))

    # ---------------- 手袋：香囊形挎包（菱形标志 + 蝴蝶结 + 流苏） ----------------
    # 参考图里手袋拿在观众右侧，也就是角色的左手（+x），提手链吊在手心正下方
    # 袋身收在 x 0.33 一线：横向包围盒仍由手心 ±0.43 决定，不会把她从座椅中心顶偏
    bag_x = 0.330
    bag_y = -0.012
    bag_front = bag_y - 0.038  # 袋身最宽处的正面，装饰都贴在这一层
    with builder.part('arm-left', 'gold'):
        for index in range(3):
            box(bm, (bag_x, bag_y - 0.020, 0.220 - index * 0.016), (0.024, 0.024, 0.013))  # 提手链，顶端埋进手心
        star(bm, (bag_x, bag_y - 0.004, 0.202), 0.020, 0.009, 0.008, points=4)  # 金框顶的冠饰，挂在链后
        box(bm, (bag_x, bag_y, 0.192), (0.094, 0.072, 0.011))  # 袋口金框
        box(bm, (bag_x, bag_front - 0.004, 0.114), (0.058, 0.010, 0.010))  # 袋底金线
    with builder.part('arm-left', 'navy'):
        box(bm, (bag_x, bag_y, 0.183), (0.098, 0.062, 0.013))  # 袋口抽绳束带
        box(bm, (bag_x, bag_front, 0.152), (0.038, 0.010, 0.038), rot=(0, 45, 0))  # 标志外圈菱形
    with builder.part('arm-left', 'white'):
        # 上窄下宽的软袋身：窄口 - 最宽 - 圆底，corner 0.5 让截面接近椭圆
        loft(bm, [(0.043, 0.036, 0.026), (0.024, 0.050, 0.033), (-0.002, 0.057, 0.036),
                  (-0.026, 0.052, 0.033), (-0.043, 0.030, 0.018)],
             (bag_x, bag_y, 0.146), corner=0.5)
        box(bm, (bag_x, bag_front - 0.004, 0.152), (0.028, 0.010, 0.028), rot=(0, 45, 0))  # 菱形内白底
    with builder.part('arm-left', 'blue'):
        wedge(bm, (bag_x, bag_front - 0.010, 0.163), (0.022, 0.0), 0.020, 0.008, rot=(0, 180, 0))  # 菱形里的下三角标志
        for sign in (1, -1):
            sheet(bm, [(bag_x, 0.106), (bag_x + 0.048 * sign, 0.128), (bag_x + 0.048 * sign, 0.086)],
                  bag_front - 0.010, 0.014)  # 蝴蝶结左右两环
        strand(bm, [(bag_x, bag_front - 0.004, 0.098), (bag_x, bag_front + 0.006, 0.070)],
               0.020, 0.014, 0.013, tip=0.012)  # 流苏
    with builder.part('arm-left', 'gold'):
        box(bm, (bag_x, bag_front - 0.014, 0.106), (0.022, 0.010, 0.022))  # 结心

    # ---------------- 头：淡紫蓝眼 + 温柔小口 ----------------
    with builder.part('head', 'skin'):
        box(bm, (0, -0.028, 0.505), (0.30, 0.245, 0.30))
        box(bm, (0, -0.02, 0.352), (0.10, 0.10, 0.04))
    for sign in (1, -1):
        with builder.part('head', 'eye-dark'):
            box(bm, (0.062 * sign, -0.152, 0.505), (0.090, 0.014, 0.100))
        with builder.part('head', 'eye-violet'):
            box(bm, (0.062 * sign, -0.158, 0.504), (0.066, 0.012, 0.078))
        with builder.part('head', 'shine'):
            box(bm, (0.076 * sign, -0.163, 0.528), (0.024, 0.010, 0.026))
    with builder.part('head', 'mouth'):
        box(bm, (0, -0.152, 0.434), (0.036, 0.014, 0.013))  # 微笑，不做獠牙
    with builder.part('head', 'blush'):
        box(bm, (0.118, -0.152, 0.462), (0.055, 0.012, 0.032))
        box(bm, (-0.118, -0.152, 0.462), (0.055, 0.012, 0.032))

    # ---------------- 头发：及腰长直发 + 侧辫 + 前垂发 ----------------
    with builder.part('head', 'hair'):
        box(bm, (0, -0.115, 0.635), (0.335, 0.09, 0.08))  # 刘海
        box(bm, (0, 0.005, 0.687), (0.33, 0.30, 0.135))  # 发盖
        box(bm, (0, 0.148, 0.545), (0.30, 0.126, 0.40))  # 后发主体
        box(bm, (0, 0.150, 0.318), (0.27, 0.118, 0.150))  # 后发下段，垂到腰
        box(bm, (0.152, -0.055, 0.520), (0.06, 0.21, 0.28))  # 脸侧发
        box(bm, (-0.152, -0.055, 0.520), (0.06, 0.21, 0.28))
    for sign in (1, -1):
        with builder.part('head', 'hair'):
            limb(bm, (0.160 * sign, 0.020, 0.470), (0.196 * sign, 0.056, 0.330), 0.060, 0.048)  # 肩前长垂发
        with builder.part('head', 'hair-light'):
            limb(bm, (0.196 * sign, 0.056, 0.330), (0.208 * sign, 0.070, 0.246), 0.048, 0.028)
            sphere(bm, (0.210 * sign, 0.072, 0.242), 0.026, 1)
    # 侧辫：一段段小方块串下来，落在右肩前方（原设定里最显眼的一缕）
    for index in range(5):
        with builder.part('head', 'hair' if index % 2 else 'hair-light'):
            box(bm, (-0.176 - index * 0.008, -0.140, 0.442 - index * 0.040),
                (0.050, 0.050, 0.044))

    # ---------------- 贝雷帽：藏青帽体 + 白丝带蝴蝶结 + 金星 ----------------
    with builder.part('head', 'navy'):
        box(bm, (-0.010, -0.028, 0.752), (0.268, 0.216, 0.020), rot=(0, 6, 0))  # 帽檐一圈
        slab(bm, (-0.010, -0.028, 0.771), (0.252, 0.204), (0.282, 0.228), 0.018, rot=(0, 6, 0))  # 帽体下段
        slab(bm, (-0.010, -0.028, 0.786), (0.282, 0.228), (0.256, 0.208), 0.014, rot=(0, 6, 0))  # 帽顶收口
    with builder.part('head', 'white'):
        ribbon(bm, -0.072, 0.746, -0.142, 0.48)  # 帽前白丝带蝴蝶结
        box(bm, (-0.075, -0.146, 0.706), (0.022, 0.014, 0.048))  # 垂下的丝带尾
    with builder.part('head', 'gold'):
        box(bm, (-0.075, -0.144, 0.744), (0.026, 0.026, 0.026))
        star(bm, (0.060, -0.152, 0.774), 0.026, 0.011, 0.012, points=4)  # 帽上金星
