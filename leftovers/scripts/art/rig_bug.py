# Rig a Tripo bug and bake a walk and a bite, exported as a skinned GLB.
# blender -b --python scripts/art/rig_bug.py -- <ant|beetle|locust|fly|snail> in.glb out.glb [sheet_prefix]
# Blender coords: Z up, head towards -Y (glTF +Z, the way the bug walks in game). Every bite strikes at
# frame 12, which the game times its chips to. Weights are procedural: each model is one mesh island.
import bpy, sys, math
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
KIND, SRC, OUT = argv[0], argv[1], argv[2]
SHEET = argv[3] if len(argv) > 3 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
for o in list(bpy.context.scene.objects):
    if o is not mesh:
        bpy.data.objects.remove(o)
mesh.parent = None
me = mesh.data
me.transform(mesh.matrix_world)
mesh.matrix_world.identity()
if KIND == 'locust':
    # Tripo modelled it side-on; turn its head to -Y like the rest.
    me.transform(Matrix.Rotation(math.pi / 2, 4, 'Z'))
V = [v.co.copy() for v in me.vertices]
V3 = Vector

def seg_dist(p, a, b):
    ab = b - a
    if ab.length_squared < 1e-9:
        return (p - a).length, 0.0
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length, t

def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)

def in_caps(v, caps):
    return any(seg_dist(v, a, b)[0] < r for a, b, r in caps)

# --- per-kind landmarks (measured from gridded renders of each mesh) ---
# BODY: capsules (a, b, radius) that hold no leg; LEGZ: below this a vertex may belong to a leg even
# inside BODY. HEAD/TAIL: y ranges where the head and the abdomen take over from the body.
LEGS = None
if KIND == 'ant':
    BODY = [(V3((0, -0.3, 0.56)), V3((0, -0.3, 0.56)), 0.27), (V3((0, 0, 0.31)), V3((0, 0, 0.31)), 0.15), (V3((0, 0.3, 0.34)), V3((0, 0.3, 0.34)), 0.25)]
    LEGZ = 0.2
    LEGS = {'f': (V3((0.12, -0.12, 0.29)), (0.21, -0.38)), 'm': (V3((0.20, 0, 0.27)), (0.38, 0.04)), 'b': (V3((0.19, 0.16, 0.31)), (0.32, 0.37))}
    BONES = {'body': V3((0, 0, 0.31)), 'head': V3((0, -0.13, 0.38)), 'tail': V3((0, 0.12, 0.33))}
    HEAD, TAIL = (-0.2, -0.08), (0.08, 0.2)
    FEELERS = {'R': (V3((0.12, -0.38, 0.72)), V3((0.24, -0.44, 0.82))), 'L': (V3((-0.06, -0.40, 0.76)), V3((-0.07, -0.45, 0.84)))}
    FEELER_Z = 0.68
elif KIND == 'beetle':
    BODY = [(V3((0, 0.05, 0.3)), V3((0, 0.05, 0.3)), 0.31), (V3((0, -0.27, 0.2)), V3((0, -0.27, 0.2)), 0.14)]
    LEGZ = 0.15
    LEGS = {'f': (V3((0.22, -0.15, 0.13)), (0.33, -0.38)), 'm': (V3((0.28, 0, 0.13)), (0.47, -0.01)), 'b': (V3((0.25, 0.18, 0.13)), (0.38, 0.37))}
    BONES = {'body': V3((0, 0.02, 0.2)), 'head': V3((0, -0.18, 0.2)), 'tail': V3((0, 0.2, 0.25))}
    HEAD, TAIL = (-0.24, -0.14), (0.15, 0.3)
    FEELERS = {}
elif KIND == 'locust':
    BODY = [(V3((0, -0.42, 0.25)), V3((0, 0.48, 0.25)), 0.11)]
    LEGZ = 0.0
    LEGS = {'f': (V3((0.12, -0.3, 0.12)), (0.3, -0.42)), 'm': (V3((0.12, -0.05, 0.12)), (0.5, -0.05)), 'b': (V3((0.12, 0.15, 0.15)), (0.29, 0.38))}
    BONES = {'body': V3((0, -0.05, 0.25)), 'head': V3((0, -0.25, 0.28)), 'tail': V3((0, 0.12, 0.25))}
    HEAD, TAIL = (-0.3, -0.18), (0.06, 0.2)
    FEELERS = {}
elif KIND == 'fly':
    BONES = {'body': V3((0, -0.05, 0.35)), 'head': V3((0, -0.2, 0.38)), 'tail': V3((0, 0.02, 0.33))}
    HEAD, TAIL = (-0.26, -0.16), (-0.02, 0.1)
    WINGS = {'R': V3((0.15, 0, 0.5)), 'L': V3((-0.15, 0, 0.5))}
    HANG = {'R': V3((0.07, -0.12, 0.2)), 'L': V3((-0.07, -0.12, 0.2))}
elif KIND == 'snail':
    BONES = {'body': V3((0, 0, 0.07)), 'tail': V3((0, 0.25, 0.07)), 'shell': V3((0, 0.1, 0.2)),
             'neck': V3((0, -0.22, 0.1)), 'head': V3((0, -0.38, 0.2))}
    EYES = {'R': (V3((0.06, -0.4, 0.33)), V3((0.1, -0.42, 0.55))), 'L': (V3((-0.06, -0.4, 0.33)), V3((-0.1, -0.42, 0.55)))}
    SHELL = (V3((0, 0.1, 0.45)), 0.32)
else:
    raise SystemExit('unknown kind ' + KIND)

legs = {}
if LEGS:
    for side, sx in (('R', 1), ('L', -1)):
        for k, (hip0, (gx, gy)) in LEGS.items():
            hip = hip0.copy(); hip.x *= sx; gx *= sx
            near = [v for v in V if (V3((v.x, v.y)) - V3((gx, gy))).length < 0.13]
            foot = min(near, key=lambda v: v.z).copy()
            # knee: the leg vertex farthest above the hip-foot line
            cand = [v for v in V if seg_dist(v, hip, foot)[0] < 0.12 and (v.z < LEGZ or not in_caps(v, BODY))]
            def off(v):
                d, t = seg_dist(v, hip, foot)
                return d if 0.2 < t < 0.8 and v.z > hip.z + (foot.z - hip.z) * t else -1
            knee = max(cand, key=off).copy() if cand else (hip + foot) / 2 + V3((0, 0, 0.08))
            knee.z -= 0.02
            legs[side + k] = (hip, knee, foot)
            print('LEG', side + k, tuple(round(c, 2) for c in hip), tuple(round(c, 2) for c in knee), tuple(round(c, 2) for c in foot))

# --- armature ---
arm_data = bpy.data.armatures.new('rig')
arm = bpy.data.objects.new('rig', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
UP = V3((0, 0, 0.08))

def bone(name, head, tail=None, parent=None):
    b = eb.new(name)
    b.head = head
    b.tail = tail if tail is not None else head + UP
    b.roll = 0
    if parent:
        b.parent = eb[parent]
    return b

bone('root', V3((0, 0, 0)))
bone('body', BONES['body'], parent='root')
for n, p in BONES.items():
    if n == 'body':
        continue
    bone(n, p, parent='neck' if n == 'head' and 'neck' in BONES else 'body')
if LEGS:
    for s, (a, b) in FEELERS.items():
        bone('ant' + s, a, b, parent='head')
    for n, (hip, knee, foot) in legs.items():
        bone('thigh' + n, hip, knee, parent='body')
        bone('shin' + n, knee, foot, parent='thigh' + n).use_connect = True
if KIND == 'fly':
    for s in 'RL':
        bone('wing' + s, WINGS[s], parent='body')
        bone('leg' + s, HANG[s], parent='body')
if KIND == 'snail':
    for s, (a, b) in EYES.items():
        bone('eye' + s, a, b, parent='head')
bpy.ops.object.mode_set(mode='OBJECT')

# --- weights ---
groups = {}
def add(name, i, w):
    if w <= 0.001:
        return
    if name not in groups:
        groups[name] = mesh.vertex_groups.new(name=name)
    groups[name].add([i], w, 'REPLACE')

def trunk(i, v, scale=1.0):
    # head / body / abdomen, blended along the body
    wh = 1 - smooth(HEAD[0], HEAD[1], v.y)
    wt = smooth(TAIL[0], TAIL[1], v.y)
    add('head', i, wh * scale); add('tail', i, wt * scale); add('body', i, (1 - wh - wt) * scale)

for i, v in enumerate(V):
    if LEGS:
        best = None
        if v.z < LEGZ or not in_caps(v, BODY):
            for n, (hip, knee, foot) in legs.items():
                d1, t1 = seg_dist(v, hip, knee)
                d2, t2 = seg_dist(v, knee, foot)
                d = min(d1, d2)
                if d < 0.09 and (best is None or d < best[0]):
                    best = (d, n, smooth(-0.15, 0.15, t2 if d2 < d1 else t1 - 1))
            for s, (a, b) in FEELERS.items():
                d, t = seg_dist(v, a, b)
                if v.z > FEELER_Z and d < 0.08 and (best is None or d < best[0]):
                    best = (d, 'ant' + s, None)
        if best:
            d, n, w = best
            if w is None:
                add(n, i, 1.0)
            else:
                add('thigh' + n, i, 1 - w); add('shin' + n, i, w)
            continue
        trunk(i, v)
    elif KIND == 'fly':
        s = 'R' if v.x > 0 else 'L'
        if v.z > 0.33 and abs(v.x) > 0.12:
            w = smooth(0.14, 0.24, abs(v.x))
            add('wing' + s, i, w); trunk(i, v, 1 - w)
        elif v.z < 0.2 and abs(v.x) > 0.03 and -0.34 < v.y < 0.08:
            w = smooth(0.2, 0.12, v.z)
            add('leg' + s, i, w); trunk(i, v, 1 - w)
        else:
            trunk(i, v)
    elif KIND == 'snail':
        c, r = SHELL
        if v.z > 0.13 and (v - c).length < r and v.y > -0.25:
            w = smooth(0.13, 0.2, v.z)
            add('shell', i, w); add('body', i, 1 - w)
            continue
        eye = None
        for s, (a, b) in EYES.items():
            d, t = seg_dist(v, a, b)
            if v.z > 0.3 and d < 0.07:
                eye = (s, smooth(0.3, 0.36, v.z))
        if eye:
            add('eye' + eye[0], i, eye[1]); add('head', i, 1 - eye[1])
            continue
        wh = 1 - smooth(-0.36, -0.28, v.y)
        wn = (1 - smooth(-0.22, -0.12, v.y)) - wh
        wt = smooth(0.15, 0.32, v.y)
        add('head', i, wh); add('neck', i, wn); add('tail', i, wt); add('body', i, 1 - wh - wn - wt)

mesh.parent = arm
mod = mesh.modifiers.new('arm', 'ARMATURE')
mod.object = arm

# --- animation helpers ---
sc = bpy.context.scene
sc.render.fps = 30
P = arm.pose.bones

def leg_pose(n, frame, back, lift, bend):
    # Turn the thigh about the vertical through the hip (`back` > 0 sweeps the foot backwards),
    # raise it (`lift`), and fold the shin up at the knee (`bend`), all in armature space.
    hip, knee, foot = legs[n]
    side = 1 if n[0] == 'R' else -1
    out = V3((foot.x - hip.x, foot.y - hip.y, 0)).normalized()
    k = out.cross(V3((0, 0, 1))).normalized()
    R = Quaternion(k, lift) @ Quaternion(V3((0, 0, 1)), back * side)
    for name, r in (('thigh' + n, R), ('shin' + n, Quaternion(k, bend))):
        pb = P[name]
        M = arm.data.bones[name].matrix_local.to_3x3().to_4x4()
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (M.inverted() @ r.to_matrix().to_4x4() @ M).to_quaternion()
        pb.keyframe_insert('rotation_quaternion', frame=frame)

def key(name, frame, loc=None, rot=None):
    pb = P[name]
    pb.rotation_mode = 'XYZ'
    if loc is not None:
        pb.location = loc
        pb.keyframe_insert('location', frame=frame)
    if rot is not None:
        pb.rotation_euler = rot
        pb.keyframe_insert('rotation_euler', frame=frame)

def new_action(name):
    act = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = act
    for pb in P:
        pb.location = (0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0)
    return act

def push(act, end):
    tr = arm.animation_data.nla_tracks.new()
    tr.name = act.name
    st = tr.strips.new(act.name, 0, act)
    st.frame_end = end
    arm.animation_data.action = None

# Bones point up (+Z) with no roll, so in pose space x is world X, y is world Z, z is world -Y.
# A world move (forward = -Y, up = +Z) is pose (x, up, fwd); a rotation (x, y, z) is pitch (nose
# down > 0), yaw, and roll about the long axis.
def W(x, fwd, up):
    return V3((x, up, fwd))

TAU = 2 * math.pi

def walk6(frames, sweep, lift, bob, sway, extra):
    tripod = {'Rf': 0, 'Lm': 0, 'Rb': 0, 'Lf': 0.5, 'Rm': 0.5, 'Lb': 0.5}
    for f in range(frames + 1):
        ph = f / frames
        for n in legs:
            p = (ph + tripod[n]) % 1
            if p < 0.5:  # stance: the foot sweeps back under the body
                a, up = -sweep + 2 * sweep * (p / 0.5), 0
            else:        # swing: lift and reach forward
                q = (p - 0.5) / 0.5
                a, up = sweep - 2 * sweep * (0.5 - 0.5 * math.cos(math.pi * q)), math.sin(math.pi * q)
            leg_pose(n, f, a, lift * up, lift * up)
        key('body', f, loc=W(0, 0, bob * abs(math.sin(TAU * ph * 2))), rot=(0, sway * math.sin(TAU * ph), 0))
        extra(f, ph)

def bite6(frames, K, extra=None):
    # K rows: frame, body forward, body up, pitch, head nod, head shake, leg turn f/m/b, front lift
    for f, fwd, up, pitch, nod, shake, ff, fm, fb, lift in K:
        key('body', f, loc=W(0, fwd, up), rot=(pitch, 0, 0))
        key('head', f, rot=(nod, shake, 0))
        key('tail', f, rot=(-pitch * 0.8, 0, 0))
        for n in legs:
            a = {'f': ff, 'm': fm, 'b': fb}[n[1]]
            leg_pose(n, f, a, lift if n[1] == 'f' else 0, lift * 0.6 if n[1] == 'f' else 0)
        if extra:
            extra(f, nod)

# --- clips ---
if KIND == 'ant':
    WALK, BITE = 12, 28
    def ant_walk(f, ph):
        key('head', f, rot=(0.05 * math.sin(TAU * ph * 2), 0.07 * math.sin(TAU * ph), 0))
        key('tail', f, rot=(-0.05 * math.sin(TAU * ph * 2 + 1), -0.1 * math.sin(TAU * ph + 0.6), 0))
        for s, sgn in (('R', 1), ('L', -1)):
            key('ant' + s, f, rot=(0.2 * math.sin(TAU * ph + (0 if s == 'R' else 1.6)), 0, 0.12 * sgn * math.sin(TAU * ph * 2)))
    act = new_action('walk'); walk6(WALK, 0.28, 0.35, 0.012, 0.05, ant_walk); push(act, WALK)
    # Rear back, lunge half a body forward, bite, shake, tug, settle. Loops while chewing.
    act = new_action('bite')
    bite6(BITE, [
        (0, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.0),
        (7, -0.06, 0.02, -0.08, -0.20, 0.00, -0.10, -0.05, 0.00, 0.6),
        (11, 0.40, 0.02, 0.10, 0.25, 0.00, -0.45, 0.35, 0.45, 0.2),
        (13, 0.42, 0.02, 0.12, 0.30, 0.12, -0.45, 0.35, 0.45, 0.2),
        (15, 0.42, 0.02, 0.12, 0.30, -0.12, -0.45, 0.35, 0.45, 0.2),
        (19, 0.32, 0.02, 0.06, 0.12, 0.00, -0.35, 0.28, 0.35, 0.1),
        (BITE, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.0),
    ], lambda f, nod: [key('ant' + s, f, rot=(-nod * 0.6, 0, 0)) for s in 'RL'])
    push(act, BITE)
elif KIND == 'beetle':
    # Heavy and low: short quick steps, the shell rocks side to side.
    WALK, BITE = 12, 30
    def beetle_walk(f, ph):
        key('head', f, rot=(0.04 * math.sin(TAU * ph * 2), 0.06 * math.sin(TAU * ph + 0.5), 0))
        key('tail', f, rot=(0, 0, 0.04 * math.sin(TAU * ph)))
    act = new_action('walk'); walk6(WALK, 0.22, 0.4, 0.01, 0.0, beetle_walk)
    for f in range(WALK + 1):
        key('body', f, rot=(0, 0.03 * math.sin(TAU * f / WALK), 0.05 * math.sin(TAU * f / WALK)))
    push(act, WALK)
    # Ram: crouch back on the hind legs, charge, headbutt with the horns, bounce off.
    act = new_action('bite')
    bite6(BITE, [
        (0, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.0),
        (8, -0.12, -0.03, -0.12, -0.25, 0.00, 0.20, 0.20, 0.25, 0.3),
        (11, 0.30, 0.02, 0.10, 0.20, 0.00, -0.35, -0.20, -0.30, 0.1),
        (12, 0.36, 0.00, 0.16, 0.40, 0.00, -0.40, -0.25, -0.35, 0.0),
        (15, 0.24, 0.02, 0.02, -0.05, 0.08, -0.30, -0.15, -0.25, 0.0),
        (19, 0.18, 0.00, 0.04, 0.10, -0.06, -0.25, -0.12, -0.20, 0.0),
        (BITE, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.0),
    ])
    push(act, BITE)
elif KIND == 'locust':
    # Long hind legs push, the abdomen swings.
    WALK, BITE = 12, 30
    def locust_walk(f, ph):
        key('head', f, rot=(0.05 * math.sin(TAU * ph * 2), 0.06 * math.sin(TAU * ph), 0))
        key('tail', f, rot=(0.04 * math.sin(TAU * ph * 2 + 1), -0.12 * math.sin(TAU * ph + 0.8), 0))
    act = new_action('walk'); walk6(WALK, 0.25, 0.35, 0.015, 0.05, locust_walk); push(act, WALK)
    # Rear up on the hind legs with the front legs raised, then slam the head down.
    act = new_action('bite')
    bite6(BITE, [
        (0, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.0),
        (8, -0.10, 0.10, -0.35, -0.30, 0.00, 0.15, 0.10, 0.20, 0.8),
        (12, 0.32, -0.02, 0.18, 0.35, 0.00, -0.40, -0.10, -0.35, 0.0),
        (15, 0.30, 0.00, 0.14, 0.25, 0.10, -0.40, -0.10, -0.35, 0.0),
        (18, 0.30, 0.00, 0.14, 0.30, -0.10, -0.40, -0.10, -0.35, 0.0),
        (22, 0.18, 0.00, 0.06, 0.10, 0.00, -0.25, -0.05, -0.20, 0.0),
        (BITE, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.0),
    ])
    push(act, BITE)
elif KIND == 'fly':
    # 'walk' is the flight loop: a fast flap, the body bobbing, the legs dangling.
    WALK, BITE = 8, 24
    def flap(f, amp, phase=0.0):
        a = amp * math.sin(TAU * f / 4 + phase)  # two beats a cycle at 30 fps
        key('wingR', f, rot=(0, 0, a + 0.15)); key('wingL', f, rot=(0, 0, -a - 0.15))
    act = new_action('walk')
    for f in range(WALK + 1):
        ph = f / WALK
        flap(f, 0.6)
        key('body', f, loc=W(0, 0, 0.03 * math.sin(TAU * ph)), rot=(0.04 * math.sin(TAU * ph), 0, 0.04 * math.sin(TAU * ph * 0.5)))
        key('head', f, rot=(0.04 * math.sin(TAU * ph + 1), 0, 0))
        for s in 'RL':
            key('leg' + s, f, rot=(0.2 * math.sin(TAU * ph + (0 if s == 'R' else 1)), 0, 0))
    push(act, WALK)
    # Swoop: climb, dive nose-first onto the fence, peck, climb back. Wings keep beating throughout.
    act = new_action('bite')
    K = [(0, 0, 0, 0, 0), (7, -0.08, 0.15, -0.25, -0.2), (12, 0.30, -0.45, 0.55, 0.35), (14, 0.30, -0.45, 0.6, 0.15),
         (16, 0.28, -0.42, 0.55, 0.35), (BITE, 0, 0, 0, 0)]
    for f, fwd, up, pitch, nod in K:
        key('body', f, loc=W(0, fwd, up), rot=(pitch, 0, 0))
        key('head', f, rot=(nod, 0, 0))
        for s in 'RL':
            key('leg' + s, f, rot=(-pitch * 0.8, 0, 0))
    for f in range(BITE + 1):
        flap(f, 0.75 if f > 9 else 0.5)
    push(act, BITE)
elif KIND == 'snail':
    # A ripple runs down the foot: the head stretches, then the tail draws up; the shell rocks,
    # the eye stalks wave out of step.
    WALK, BITE = 24, 30
    act = new_action('walk')
    for f in range(WALK + 1):
        ph = f / WALK
        s = math.sin(TAU * ph)
        key('neck', f, loc=W(0, 0.04 * max(0, s), 0), rot=(-0.06 * s, 0.05 * math.sin(TAU * ph * 0.5), 0))
        key('tail', f, loc=W(0, 0.04 * max(0, -s), 0.01 * max(0, -s)))
        key('body', f, loc=W(0, 0, 0.008 * abs(s)))
        key('shell', f, rot=(0.04 * s, 0, 0.05 * math.sin(TAU * ph + 1)))
        key('head', f, rot=(0.05 * math.sin(TAU * ph + 0.8), 0, 0))
        key('eyeR', f, rot=(0.25 * math.sin(TAU * ph), 0, 0.12 * math.sin(TAU * ph * 2)))
        key('eyeL', f, rot=(0.25 * math.sin(TAU * ph + 2), 0, -0.12 * math.sin(TAU * ph * 2 + 1)))
    push(act, WALK)
    # Chomp: stretch out, eyes fold back, the head chomps down on the fence, pulls back.
    act = new_action('bite')
    K = [(0, 0, 0, 0, 0, 0), (8, 0.06, 0.05, -0.25, -0.3, -0.5), (12, 0.16, -0.03, 0.35, 0.35, -0.7),
         (15, 0.14, -0.02, 0.25, 0.2, -0.7), (18, 0.16, -0.03, 0.35, 0.35, -0.6), (BITE, 0, 0, 0, 0, 0)]
    for f, fwd, up, pitch, nod, eye in K:
        key('neck', f, loc=W(0, fwd, up), rot=(pitch, 0, 0))
        key('head', f, rot=(nod, 0, 0))
        key('shell', f, rot=(-pitch * 0.2, 0, 0))
        key('tail', f, loc=W(0, fwd * 0.3, 0))
        for e in ('eyeR', 'eyeL'):
            key(e, f, rot=(eye, 0, 0))
    push(act, BITE)

if SHEET:
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.8
    d = V3((0.9, -1.0, 1.1)).normalized()
    cam.location = V3((0, -0.15, 0.3)) + d * 4
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x = sc.render.resolution_y = 260
    ad = arm.animation_data
    for tr in ad.nla_tracks:
        tr.mute = True
    for tr in ad.nla_tracks:
        tr.mute = False
        n = tr.name
        end = WALK if n == 'walk' else BITE
        for f in range(0, end + 1, (1 if KIND == 'fly' else 2) if n == 'walk' else 3):
            sc.frame_set(f)
            sc.render.filepath = f'{SHEET}_{n}_{f:02d}.png'
            bpy.ops.render.render(write_still=True)
        tr.mute = True
    for tr in ad.nla_tracks:
        tr.mute = False

bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
    export_force_sampling=True, export_def_bones=True, export_skins=True, export_normals=True,
    export_materials='NONE', export_texcoords=False, export_yup=True, export_optimize_animation_size=True,
)
print('DONE', OUT)
