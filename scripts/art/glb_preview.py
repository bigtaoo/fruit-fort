# Render a GLB from above and from a high 3/4 angle, for checking Tripo meshes before use.
#
#   blender -b --factory-startup -P scripts/art/glb_preview.py -- in.glb out_prefix
#
# Writes out_prefix_top.png and out_prefix_34.png (512 px, workbench, grey matcap) and prints
# the bounding box, so the facing and the size can be read off before baking.

import bpy, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
mid, size = (lo + hi) / 2, max(hi - lo)
tris = sum(len(o.data.polygons) for o in meshes)
# Blender is z-up: glTF +z (forward) is Blender -y, glTF y (up) is Blender z.
print(f'PREVIEW {src}: {tris} faces, x {lo.x:.3f}..{hi.x:.3f}  y(fwd -) {lo.y:.3f}..{hi.y:.3f}  z(up) {lo.z:.3f}..{hi.z:.3f}')

sc = bpy.context.scene
# A small ball just past the front (glTF +z), so the facing shows in both shots.
bpy.ops.mesh.primitive_uv_sphere_add(radius=size * 0.04, location=(mid.x, lo.y - size * 0.06, 0))
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.show_cavity = True
sc.render.resolution_x = sc.render.resolution_y = 512
sc.render.film_transparent = False
sc.world = bpy.data.worlds.new('w')
sc.world.color = (0.85, 0.87, 0.9)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 1.25  # fixed, so a grid can be laid over the top shot (all meshes are about 1 across)

def shot(direction, name):
    d = Vector(direction).normalized()
    cam.location = Vector((0, 0, mid.z)) + d * 3
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}_{name}.png'
    bpy.ops.render.render(write_still=True)

shot((0, 0.0001, 1), 'top')          # straight down, forward (glTF +z) at the top of the frame
shot((0.6, -1.2, 1.3), '34')         # from the front right, above
