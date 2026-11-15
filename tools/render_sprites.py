"""Model and render every game sprite with Blender (bpy), then pack sprite sheets.

Run:  python3 tools/render_sprites.py [asset ...]
Needs: pip install bpy pillow
Output: assets/sprites/*.png + assets/sprites/meta.json
"""
import bpy, json, math, os, random, sys
from mathutils import Vector
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "sprites")
TMP = os.path.join(ROOT, "tools", "_frames")
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
PPU = 160  # pixels per Blender unit (sprites are drawn at half size in game)
META = {}

_mats = {}
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------------------------------------------------------------- scene setup
def reset(w, h, cx=0.0, cz=0.0, samples=40):
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for d in list(coll):
            coll.remove(d)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.65, 0.85, 1)
    bg.inputs[1].default_value = 0.3
    sc.world = world
    cam_d = bpy.data.cameras.new("Cam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = max(w, h) / PPU
    cam = bpy.data.objects.new("Cam", cam_d)
    cam.location = (cx, -20, cz)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    sc.collection.objects.link(cam)
    sc.camera = cam

    def sun(name, rot, energy, color):
        d = bpy.data.lights.new(name, "SUN")
        d.energy, d.color, d.angle = energy, color, 0.15
        o = bpy.data.objects.new(name, d)
        o.rotation_euler = rot
        sc.collection.objects.link(o)

    sun("key", (math.radians(55), 0, math.radians(-35)), 2.4, (1.0, 0.95, 0.85))
    sun("rim", (math.radians(-70), 0, math.radians(150)), 2.2, (0.35, 0.9, 1.0))
    sun("fill", (math.radians(80), 0, math.radians(60)), 0.5, (1.0, 0.7, 0.5))
    return sc


def mat(color, metal=0.0, rough=0.5, emit=0.0):
    key = (tuple(color), metal, rough, emit)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new("m")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    c = (*color, 1)
    b.inputs["Base Color"].default_value = c
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = c
        b.inputs["Emission Strength"].default_value = emit * 0.32
    _mats[key] = m
    return m


def _finish(o, m, parent, bevel=0.0, smooth=True):
    o.data.materials.append(m)
    if parent is not None:
        o.parent = parent
    if bevel:
        mod = o.modifiers.new("b", "BEVEL")
        mod.width, mod.segments = bevel, 3
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
        try:
            mod = o.modifiers.new("s", "NODES")
            o.modifiers.remove(mod)
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            bpy.ops.object.shade_auto_smooth(angle=0.7)
            o.select_set(False)
        except Exception:
            pass
    return o


def box(size, loc, m, parent=None, bevel=0.02, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    return _finish(o, m, parent, bevel)


def cyl(r, depth, loc, m, parent=None, rot=(0, 0, 0), bevel=0.0, verts=24, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, vertices=verts, location=loc, rotation=rot)
    return _finish(bpy.context.object, m, parent, bevel)


def sph(r, loc, m, parent=None, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=24, ring_count=12)
    o = bpy.context.object
    o.scale = scale
    return _finish(o, m, parent)


def empty(loc, parent=None, rot=(0, 0, 0)):
    o = bpy.data.objects.new("j", None)
    o.location, o.rotation_euler = loc, rot
    bpy.context.scene.collection.objects.link(o)
    if parent is not None:
        o.parent = parent
    return o


def render(name):
    path = os.path.join(TMP, name + ".png")
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def world_min_z():
    bpy.context.view_layer.update()
    lo = 1e9
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            e = o.evaluated_get(dg)
            for c in e.bound_box:
                lo = min(lo, (e.matrix_world @ Vector(c)).z)
    return lo


def to_px(p, w, h, cx, cz):
    """World point -> pixel in the rendered cell."""
    return [round((p.x - cx) * PPU + w / 2, 1), round(h / 2 - (p.z - cz) * PPU, 1)]


def pack(name, paths, cols=None):
    ims = [Image.open(p).convert("RGBA") for p in paths]
    w, h = ims[0].size
    cols = cols or len(ims)
    rows = math.ceil(len(ims) / cols)
    sheet = Image.new("RGBA", (w * cols, h * rows), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    sheet.save(os.path.join(OUT, name + ".png"), optimize=True)
    META.setdefault(name, {}).update({"fw": w, "fh": h, "frames": len(ims), "cols": cols})


# ---------------------------------------------------------------- humanoid rig
def humanoid(pal, gun_arm=False, bulky=1.0, eye="visor"):
    """Soldier built from primitives, facing +X. Returns joint dict."""
    A, B, C, G = (mat(pal["armor"], 0.3, 0.45), mat(pal["suit"], 0.1, 0.7),
                  mat(pal["trim"], 0.8, 0.3), mat(pal["glow"], 0, 0.3, 6))
    j = {}
    j["root"] = empty((0, 0, 0.57), rot=(0, 0, math.radians(-28)))
    box((0.20, 0.26 * bulky, 0.14), (0, 0, 0), B, j["root"], 0.03)
    box((0.22, 0.28 * bulky, 0.05), (0, 0, 0.05), C, j["root"], 0.01)
    j["torso"] = empty((0, 0, 0.07), j["root"])
    box((0.28 * bulky, 0.34 * bulky, 0.34), (0, 0, 0.19), A, j["torso"], 0.05)
    box((0.06, 0.22 * bulky, 0.16), (0.12 * bulky, 0, 0.23), C, j["torso"], 0.02)
    box((0.03, 0.10, 0.04), (0.155 * bulky, 0, 0.25), G, j["torso"], 0.005)
    # jump pack
    box((0.12, 0.24, 0.26), (-0.17 * bulky, 0, 0.22), B, j["torso"], 0.03)
    for y in (-0.07, 0.07):
        cyl(0.04, 0.08, (-0.18 * bulky, y, 0.07), C, j["torso"])
    j["head"] = empty((0, 0, 0.38), j["torso"])
    cyl(0.05, 0.06, (0, 0, 0.0), B, j["head"])
    sph(0.135, (0.01, 0, 0.13), A, j["head"], (1.05, 0.95, 1.0))
    if eye == "visor":
        sph(0.11, (0.085, 0, 0.125), G, j["head"], (0.9, 1.08, 0.42))
        box((0.20, 0.03, 0.03), (-0.02, 0, 0.26), C, j["head"], 0.01)
    else:
        sph(0.045, (0.115, 0, 0.14), G, j["head"])
        box((0.03, 0.30, 0.05), (0.0, 0, 0.16), C, j["head"], 0.01)
    for side, y in (("L", 0.085), ("R", -0.085)):
        hip = empty((0, y * bulky, -0.04), j["root"])
        cyl(0.088 * bulky, 0.26, (0, 0, -0.12), B, hip, bevel=0.02)
        box((0.10, 0.13 * bulky, 0.12), (0.03, 0, -0.10), A, hip, 0.02)
        knee = empty((0, 0, -0.24), hip)
        sph(0.07 * bulky, (0.01, 0, 0), C, knee)
        cyl(0.078 * bulky, 0.24, (0, 0, -0.12), A, knee, bevel=0.02)
        box((0.19, 0.11 * bulky, 0.07), (0.035, 0, -0.26), C, knee, 0.02)
        j["hip" + side], j["knee" + side] = hip, knee
    # far-side arm (always part of the body)
    sh = empty((0, 0.2 * bulky, 0.30), j["torso"])
    sph(0.085 * bulky, (0, 0, 0), A, sh)
    cyl(0.068 * bulky, 0.2, (0, 0, -0.11), B, sh, bevel=0.02)
    el = empty((0, 0, -0.21), sh)
    cyl(0.062 * bulky, 0.18, (0, 0, -0.09), A, el, bevel=0.02)
    sph(0.055, (0, 0, -0.2), C, el)
    j["armL"], j["elbowL"] = sh, el
    # near-side shoulder pad (the gun arm is a separate sprite for the hero)
    j["shoulderR"] = empty((0, -0.2 * bulky, 0.30), j["torso"])
    sph(0.09 * bulky, (0, 0, 0), A, j["shoulderR"])
    if gun_arm:
        gun_arm_mesh(pal, j["shoulderR"])
    return j


def gun_arm_mesh(pal, parent, long=False):
    """Arm + rifle extended along +X from the shoulder at the parent origin."""
    A, B, C, G = (mat(pal["armor"], 0.3, 0.45), mat(pal["suit"], 0.1, 0.7),
                  mat(pal["trim"], 0.8, 0.3), mat(pal["glow"], 0, 0.3, 6))
    D = mat((0.2, 0.22, 0.27), 0.7, 0.4)
    h = math.pi / 2
    cyl(0.068, 0.2, (0.1, 0, -0.03), B, parent, rot=(0, h + 0.3, 0), bevel=0.02)
    cyl(0.062, 0.18, (0.27, 0, -0.05), A, parent, rot=(0, h - 0.1, 0), bevel=0.02)
    sph(0.055, (0.37, 0, -0.045), C, parent)
    L = 0.62 if long else 0.5
    box((L, 0.09, 0.11), (0.33, 0, 0.02), D, parent, 0.02)
    box((0.07, 0.07, 0.15), (0.20, 0, -0.09), D, parent, 0.015, rot=(0, 0.3, 0))
    box((0.16, 0.1, 0.05), (0.2, 0, 0.09), C, parent, 0.01)
    cyl(0.03, 0.26, (0.33 + L / 2 + 0.1, 0, 0.03), C, parent, rot=(0, h, 0))
    box((0.26, 0.095, 0.025), (0.40, 0, 0.02), G, parent, 0.005)
    cyl(0.04, 0.05, (0.33 + L / 2 + 0.22, 0, 0.03), D, parent, rot=(0, h, 0))


def pose(j, thighL=0, kneeL=0, thighR=0, kneeR=0, lean=0, arm=0, elbow=0, head=0, ground=True, lift=0.0):
    j["hipL"].rotation_euler.y, j["kneeL"].rotation_euler.y = thighL, kneeL
    j["hipR"].rotation_euler.y, j["kneeR"].rotation_euler.y = thighR, kneeR
    j["torso"].rotation_euler.y = lean
    j["head"].rotation_euler.y = head - lean * 0.7
    j["armL"].rotation_euler.y, j["elbowL"].rotation_euler.y = arm, elbow
    if ground:
        j["root"].location.z += -world_min_z() + lift


def run_pose(j, t):
    ph = 2 * math.pi * t
    def leg(p):
        return -0.75 * math.sin(p) - 0.1, 0.25 + 1.15 * max(0.0, math.sin(p - 1.9))
    tl, kl = leg(ph)
    tr, kr = leg(ph + math.pi)
    pose(j, tl, kl, tr, kr, lean=0.2, arm=0.7 * math.sin(ph), elbow=-0.9,
         lift=0.03 * abs(math.sin(ph * 1.0 + 0.6)))


HERO = dict(armor=(0.9, 0.22, 0.02), suit=(0.10, 0.12, 0.16), trim=(0.45, 0.50, 0.58), glow=(0.1, 0.9, 1.0))
TROOP = dict(armor=(0.55, 0.06, 0.10), suit=(0.07, 0.07, 0.09), trim=(0.30, 0.30, 0.34), glow=(1.0, 0.25, 0.05))
HEAVY = dict(armor=(0.42, 0.20, 0.70), suit=(0.08, 0.07, 0.12), trim=(0.75, 0.62, 0.20), glow=(1.0, 0.85, 0.1))
CW, CH, CZ = 256, 256, 0.7  # humanoid cell; ground line sits 16px above the bottom


def hero():
    paths, pivots = [], []
    poses = [("idle", lambda j: pose(j, -0.18, 0.2, 0.22, 0.25, lean=0.05, arm=0.15, elbow=-0.5))]
    poses += [("run%d" % i, (lambda j, i=i: run_pose(j, i / 8))) for i in range(8)]
    poses += [("jump", lambda j: pose(j, 0.35, 0.9, -1.15, 1.5, lean=0.1, arm=1.0, elbow=-1.0, ground=False)),
              ("fall", lambda j: pose(j, 0.5, 0.4, -0.5, 0.7, lean=-0.05, arm=-1.2, elbow=-0.6, ground=False)),
              ("crouch", lambda j: pose(j, -1.55, 2.35, -0.6, 2.2, lean=0.35, arm=0.2, elbow=-1.2))]
    for name, fn in poses:
        reset(CW, CH, 0, CZ)
        j = humanoid(HERO)
        fn(j)
        if name in ("jump", "fall"):
            j["root"].location.z = 0.66
        bpy.context.view_layer.update()
        pivots.append(to_px(j["shoulderR"].matrix_world.translation, CW, CH, 0, CZ))
        paths.append(render("hero_" + name))
    pack("hero", paths)
    META["hero"].update(names=[n for n, _ in poses], shoulder=pivots, ground=CH - 16)
    # separate gun arm, pivot = shoulder at world origin
    for nm, long in (("hero_arm", False),):
        reset(256, 128, 0.35, 0)
        p = empty((0, 0, 0))
        sph(0.09, (0, 0, 0), mat(HERO["armor"], 0.3, 0.45), p)
        gun_arm_mesh(HERO, p, long)
        pack(nm, [render(nm)])
        META[nm].update(pivot=to_px(Vector((0, 0, 0)), 256, 128, 0.35, 0),
                        muzzle=to_px(Vector((0.85, 0, 0.03)), 256, 128, 0.35, 0))


def trooper():
    paths = []
    for i in range(8):
        reset(CW, CH, 0, CZ)
        j = humanoid(TROOP, gun_arm=True, eye="mono")
        run_pose(j, i / 8)
        paths.append(render("troop_%d" % i))
    pack("trooper", paths)
    META["trooper"].update(ground=CH - 16)
    reset(320, 320, 0, 0.9)
    j = humanoid(HEAVY, gun_arm=True, bulky=1.25, eye="mono")
    j["root"].scale = (1.3, 1.3, 1.3)
    pose(j, -0.3, 0.35, 0.3, 0.3, lean=0.1, arm=0.3, elbow=-0.8)
    bpy.context.view_layer.update()
    muz = to_px(j["shoulderR"].matrix_world @ Vector((0.85, 0, 0.03)), 320, 320, 0, 0.9)
    pack("heavy", [render("heavy")])
    META["heavy"].update(ground=320 - 16, muzzle=muz)


# ---------------------------------------------------------------- machines
def turret():
    D, M, R = mat((0.16, 0.18, 0.22), 0.9, 0.4), mat((0.5, 0.54, 0.6), 0.9, 0.3), mat((1, 0.15, 0.05), 0, 0.3, 8)
    reset(192, 192, 0, 0.5)
    cyl(0.5, 0.16, (0, 0, 0.08), D, bevel=0.03, r2=0.38)
    cyl(0.3, 0.3, (0, 0, 0.3), M, bevel=0.03)
    box((0.62, 0.3, 0.04), (0, 0, 0.17), mat((0.9, 0.7, 0.1), 0.2, 0.5), None, 0.01)
    sph(0.3, (0, 0, 0.55), D, None, (1, 1, 0.8))
    pack("turret_base", [render("turret_base")])
    META["turret_base"].update(pivot=to_px(Vector((0, 0, 0.58)), 192, 192, 0, 0.5), ground=to_px(Vector((0, 0, 0)), 192, 192, 0, 0.5)[1])
    reset(256, 128, 0.2, 0)
    h = math.pi / 2
    sph(0.24, (0, 0, 0), M)
    box((0.5, 0.2, 0.2), (0.3, 0, 0), D, None, 0.03)
    for y in (-0.06, 0.06):
        cyl(0.045, 0.5, (0.7, y, 0), M, rot=(0, h, 0))
    box((0.1, 0.24, 0.24), (0.52, 0, 0), M, None, 0.02)
    sph(0.09, (0.02, -0.2, 0.02), R)
    pack("turret_gun", [render("turret_gun")])
    META["turret_gun"].update(pivot=to_px(Vector((0, 0, 0)), 256, 128, 0.2, 0))


def drone():
    for name, body, glow, crate in (("drone", (0.5, 0.07, 0.1), (1, 0.2, 0.05), False),
                                    ("carrier", (0.2, 0.5, 0.3), (0.3, 1, 0.4), True)):
        paths = []
        for f in range(2):
            reset(256, 256, 0, 0)
            D, M = mat((0.12, 0.13, 0.16), 0.9, 0.4), mat(body, 0.5, 0.35)
            G = mat(glow, 0, 0.3, 8)
            r = empty((0, 0, 0.12 if crate else 0), rot=(0, 0, math.radians(-25)))
            sph(0.3, (0, 0, 0), M, r, (1.25, 1, 0.7))
            sph(0.14, (0.27, 0, -0.02), G, r, (0.7, 1, 1))
            cyl(0.33, 0.05, (0, 0, 0), D, r, bevel=0.01)
            for y in (-0.42, 0.42):
                box((0.1, 0.3, 0.05), (0, y * 0.7, 0.03), D, r, 0.01)
                cyl(0.12, 0.1, (0, y, 0.05), M, r, bevel=0.02)
                rot = empty((0, y, 0.13), r, rot=(0, 0, f * 1.57 / 2 + (0.5 if y > 0 else 0)))
                box((0.5, 0.045, 0.012), (0, 0, 0), D, rot, 0.0)
                box((0.045, 0.5, 0.012), (0, 0, 0), D, rot, 0.0)
            cyl(0.012, 0.22, (-0.2, 0, 0.3), D, r)
            sph(0.03, (-0.2, 0, 0.42), G, r)
            if crate:
                cyl(0.015, 0.2, (0, 0, -0.28), D, r)
                box((0.34, 0.34, 0.3), (0, 0, -0.5), mat((0.75, 0.6, 0.25), 0.3, 0.5), r, 0.03)
                box((0.36, 0.36, 0.06), (0, 0, -0.5), G, r, 0.01)
            else:
                cyl(0.05, 0.18, (0.12, 0, -0.26), D, r, r2=0.03)
            paths.append(render("%s_%d" % (name, f)))
        pack(name, paths)


def crates():
    cols = {"S": (1.0, 0.45, 0.05), "L": (0.1, 0.85, 1.0), "R": (1.0, 0.9, 0.1), "H": (0.25, 1.0, 0.35)}
    paths = []
    for k, c in cols.items():
        reset(128, 128, 0, 0)
        r = empty((0, 0, 0), rot=(math.radians(12), 0, math.radians(-30)))
        box((0.44, 0.44, 0.44), (0, 0, 0), mat((0.16, 0.18, 0.22), 0.85, 0.35), r, 0.05)
        G = mat(c, 0, 0.3, 7)
        box((0.46, 0.46, 0.1), (0, 0, 0), G, r, 0.01)
        box((0.1, 0.46, 0.46), (0, 0, 0), G, r, 0.01)
        for x in (-0.2, 0.2):
            for y in (-0.2, 0.2):
                for z in (-0.2, 0.2):
                    sph(0.05, (x, y, z), mat((0.6, 0.63, 0.7), 0.9, 0.3), r)
        paths.append(render("crate_" + k))
    pack("crates", paths)
    META["crates"].update(order="SLRH")


def boss():
    W, H, CXZ = 768, 640, (0.0, 1.85)
    D, M, A = mat((0.11, 0.12, 0.15), 0.9, 0.4), mat((0.42, 0.45, 0.52), 0.9, 0.35), mat((0.5, 0.05, 0.08), 0.5, 0.4)
    R, Y = mat((1, 0.12, 0.05), 0, 0.3, 9), mat((1.0, 0.75, 0.1), 0.2, 0.5)
    paths = []
    for f in range(4):
        reset(W, H, *CXZ, samples=48)
        root = empty((0, 0, 0), rot=(0, 0, math.radians(-22)))
        ph = f * math.pi / 2
        body_z = 1.75 + 0.05 * math.sin(ph * 2)
        hull = empty((0, 0, body_z), root, rot=(0, 0.06 * math.sin(ph), 0))
        box((1.9, 1.5, 1.2), (0, 0, 0.3), M, hull, 0.18)
        box((1.5, 1.6, 0.5), (-0.1, 0, 0.75), A, hull, 0.12)
        box((0.5, 1.2, 0.9), (0.9, 0, 0.2), D, hull, 0.1)
        sph(0.42, (1.08, 0, 0.25), R, hull, (0.6, 1, 1))      # reactor core (weak point)
        cyl(0.5, 0.12, (1.04, 0, 0.25), Y, hull, rot=(0, math.pi / 2, 0), bevel=0.02)
        box((0.9, 1.7, 0.16), (0.2, 0, -0.32), Y, hull, 0.03)
        # missile pod
        box((0.8, 0.9, 0.45), (-0.45, 0, 1.2), D, hull, 0.06)
        for y in (-0.25, 0, 0.25):
            cyl(0.09, 0.3, (-0.1, y, 1.22), R if y == 0 else M, hull, rot=(0, math.pi / 2, 0))
        # arm cannons
        for y in (-0.95, 0.95):
            sph(0.32, (0.1, y, 0.35), A, hull)
            box((1.3, 0.34, 0.4), (0.7, y, 0.05), D, hull, 0.06, rot=(0, 0.25, 0))
            cyl(0.11, 0.7, (1.5, y, -0.17), M, hull, rot=(0, math.pi / 2 + 0.25, 0))
            box((0.5, 0.36, 0.08), (0.6, y, 0.26), R, hull, 0.01, rot=(0, 0.25, 0))
        # exhaust stacks
        for y in (-0.4, 0.4):
            cyl(0.1, 0.6, (-0.85, y, 1.0), D, hull)
        # legs (reverse-jointed)
        for i, y in enumerate((-0.6, 0.6)):
            sw = math.sin(ph + i * math.pi)
            hip = empty((-0.1, y, body_z - 0.2), root, rot=(0, 0.55 + 0.3 * sw, 0))
            sph(0.3, (0, 0, 0), A, hip)
            box((0.36, 0.34, 0.9), (0, 0, -0.42), M, hip, 0.08)
            knee = empty((0, 0, -0.85), hip, rot=(0, -1.2 - 0.25 * sw, 0))
            sph(0.24, (0, 0, 0), D, knee)
            box((0.28, 0.28, 0.85), (0, 0, -0.42), D, knee, 0.06)
            foot = empty((0, 0, -0.85), knee, rot=(0, 0.65 - 0.05 * sw, 0))
            box((0.9, 0.5, 0.2), (0.12, 0, -0.06), M, foot, 0.05)
            box((0.3, 0.52, 0.08), (0.42, 0, 0.02), Y, foot, 0.01)
        root.location.z -= world_min_z()
        bpy.context.view_layer.update()
        core = to_px(hull.matrix_world @ Vector((1.2, 0, 0.25)), W, H, *CXZ)
        gun = to_px(hull.matrix_world @ Vector((1.85, -0.95, -0.25)), W, H, *CXZ)
        pod = to_px(hull.matrix_world @ Vector((0.1, 0, 1.25)), W, H, *CXZ)
        paths.append(render("boss_%d" % f))
    pack("boss", paths, cols=2)
    META["boss"].update(core=core, gun=gun, pod=pod, ground=to_px(Vector((0, 0, 0)), W, H, *CXZ)[1])


# ---------------------------------------------------------------- tiles
PERIOD = 1.6  # world units per 256px tile; geometry repeats so tiles are seamless


def periodic(fn, n=3):
    for k in range(-n, n + 1):
        fn(k * PERIOD)


def tiles():
    rnd = random.Random(7)
    # jungle ground -------------------------------------------------
    reset(256, 256, 0, -0.55, samples=64)
    box((30, 1.2, 0.5), (0, 0.4, -0.3), mat((0.30, 0.19, 0.10), 0, 0.9), None, 0)
    box((30, 1.1, 0.5), (0, 0.45, -0.8), mat((0.22, 0.13, 0.08), 0, 0.9), None, 0)
    box((30, 1.0, 0.6), (0, 0.5, -1.3), mat((0.14, 0.09, 0.07), 0, 0.9), None, 0)
    box((30, 1.3, 0.12), (0, 0.38, -0.02), mat((0.16, 0.5, 0.12), 0, 0.8), None, 0.04)
    stones = [(rnd.uniform(-0.8, 0.8), rnd.uniform(-1.3, -0.2), rnd.uniform(0.06, 0.17), rnd.random()) for _ in range(16)]
    blades = [(rnd.uniform(-0.8, 0.8), rnd.uniform(-0.25, 0.1), rnd.uniform(0.08, 0.2), rnd.uniform(-0.4, 0.4), rnd.random()) for _ in range(46)]
    vines = [(rnd.uniform(-0.8, 0.8), rnd.uniform(0.15, 0.5)) for _ in range(7)]
    def geo(dx):
        for x, z, r, s in stones:
            g = 0.25 + 0.2 * s
            o = sph(r, (x + dx, -0.2, z), mat((g, g * 0.95, g * 0.9), 0, 0.8), None, (1.3, 0.8, 0.8))
            o.rotation_euler = (s * 3, s * 5, s * 7)
        for x, y, hgt, tilt, s in blades:
            cyl(0.03, hgt, (x + dx, y, 0.04 + hgt / 2), mat((0.12 + 0.2 * s, 0.55 + 0.3 * s, 0.1), 0, 0.7), None, rot=(0, tilt, 0), r2=0.0, verts=6)
        for x, ln in vines:
            cyl(0.02, ln, (x + dx, -0.22, -0.05 - ln / 2), mat((0.1, 0.4, 0.12), 0, 0.8), None, verts=6)
            sph(0.045, (x + dx, -0.22, -0.08 - ln), mat((0.1, 0.9, 0.8), 0, 0.4, 4))
    periodic(geo)
    pack("tile_ground", [render("tile_ground")])
    META["tile_ground"].update(top=to_px(Vector((0, 0, 0.04)), 256, 256, 0, -0.55)[1])

    # steel floor ---------------------------------------------------
    reset(256, 256, 0, -0.55, samples=64)
    D, M = mat((0.13, 0.15, 0.19), 0.9, 0.45), mat((0.36, 0.40, 0.47), 0.9, 0.35)
    box((30, 1.2, 1.7), (0, 0.4, -0.9), D, None, 0)
    box((30, 1.3, 0.1), (0, 0.38, -0.01), M, None, 0.02)
    def geo2(dx):
        for i in range(4):
            x = dx - 0.6 + i * 0.4
            box((0.36, 0.1, 0.5), (x, -0.2, -0.42), M, None, 0.03)
            box((0.36, 0.1, 0.62), (x, -0.2, -1.05), mat((0.2, 0.22, 0.27), 0.9, 0.4), None, 0.03)
            for z in (-0.22, -0.62):
                sph(0.022, (x - 0.13, -0.26, z), M), sph(0.022, (x + 0.13, -0.26, z), M)
        box((0.5, 0.1, 0.06), (dx - 0.4, -0.22, -0.1), mat((1.0, 0.7, 0.05), 0.1, 0.5), None, 0.01)
        box((0.3, 0.1, 0.05), (dx + 0.4, -0.23, -0.74), mat((1, 0.15, 0.05), 0, 0.3, 6), None, 0.01)
        cyl(0.05, 1.6, (dx, -0.24, -0.78), mat((0.5, 0.3, 0.12), 0.9, 0.4), None, rot=(0, math.pi / 2, 0))
    periodic(geo2)
    pack("tile_steel", [render("tile_steel")])
    META["tile_steel"].update(top=to_px(Vector((0, 0, 0.04)), 256, 256, 0, -0.55)[1])

    # wooden bridge platform ----------------------------------------
    reset(256, 80, 0, -0.17, samples=64)
    def geo3(dx):
        for i in range(4):
            s = random.Random(i).random()
            box((0.37, 0.7, 0.1), (dx - 0.6 + i * 0.4, 0.1, -0.05), mat((0.5 + 0.12 * s, 0.32 + 0.08 * s, 0.14), 0, 0.8), None, 0.02,
                rot=(0, 0, (s - 0.5) * 0.06))
        for x in (-0.4, 0.4):
            cyl(0.05, 0.3, (dx + x, -0.22, -0.2), mat((0.3, 0.2, 0.1), 0, 0.8), None)
    periodic(geo3)
    cyl(0.035, 30, (0, -0.25, -0.16), mat((0.7, 0.6, 0.35), 0, 0.9), None, rot=(0, math.pi / 2, 0))
    box((30, 0.5, 0.08), (0, 0.15, -0.14), mat((0.25, 0.16, 0.08), 0, 0.9), None, 0)
    pack("plat_wood", [render("plat_wood")])
    META["plat_wood"].update(top=to_px(Vector((0, 0, 0)), 256, 80, 0, -0.17)[1])

    # steel catwalk platform ----------------------------------------
    reset(256, 80, 0, -0.17, samples=64)
    box((30, 0.7, 0.07), (0, 0.1, -0.035), M, None, 0.015)
    box((30, 0.1, 0.14), (0, -0.2, -0.14), D, None, 0.02)
    def geo4(dx):
        for i in range(8):
            box((0.03, 0.1, 0.16), (dx - 0.7 + i * 0.2, -0.26, -0.14), mat((1.0, 0.7, 0.05), 0.1, 0.5) if i % 2 else D, None, 0,
                rot=(0, 0.5, 0))
        for x in (-0.4, 0.4):
            box((0.1, 0.3, 0.2), (dx + x, 0, -0.3), D, None, 0.02)
            sph(0.03, (dx + x, -0.27, -0.3), mat((0.1, 0.9, 1.0), 0, 0.3, 6))
    periodic(geo4)
    pack("plat_steel", [render("plat_steel")])
    META["plat_steel"].update(top=to_px(Vector((0, 0, 0)), 256, 80, 0, -0.17)[1])


ASSETS = dict(hero=hero, trooper=trooper, turret=turret, drone=drone, crates=crates, boss=boss, tiles=tiles)

if __name__ == "__main__":
    meta_path = os.path.join(OUT, "meta.json")
    if os.path.exists(meta_path):
        META.update(json.load(open(meta_path)))
    for name in (sys.argv[1:] or ASSETS):
        print("== rendering", name, flush=True)
        ASSETS[name]()
        json.dump(META, open(meta_path, "w"), indent=1)
        open(os.path.join(OUT, "meta.js"), "w").write("window.SPRITE_META = " + json.dumps(META) + ";\n")
    print("done")
