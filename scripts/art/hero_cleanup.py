# Clean up a Tripo hero mesh in Blender for troopers.ts (docs/art/tripo_heroes/README.md).
#
#   blender -b -P scripts/art/hero_cleanup.py -- in.glb out.glb [levels] [crease_deg] [triangles]
#
# Tripo's H2.5 export is ~1,200 coarse triangles: the silhouette is lumpy, the paint regions
# (picked per triangle in troopers.ts) come out jagged, and the shoulders stretch when the arms
# swing. This welds and tidies the shell and subdivides it
# once with the hard edges creased, so the panels round off but keep their corners, then
# decimates back to a budget. Out comes one
# mesh with POSITION, NORMAL and indices only, in Tripo's own frame (1 tall, facing +z, feet
# on y = 0, which the paint rules in troopers.ts are written against), no node transform.

import bpy, bmesh, math, sys

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]
levels = int(argv[2]) if len(argv) > 2 else 1
crease = math.radians(float(argv[3]) if len(argv) > 3 else 50)
target = int(argv[4]) if len(argv) > 4 else 0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects:
    o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

me = obj.data
bm = bmesh.new()
bm.from_mesh(me)
before = len(bm.faces)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
# No symmetrize and no normal recalculation: the shell is not quite closed, and both flipped
# patches of the chest dark.
# Crease the hard edges, so the subdivision keeps the armour's panel lines and corners.
layer = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
for e in bm.edges:
    if len(e.link_faces) == 2 and e.calc_face_angle(0) > crease:
        e[layer] = 0.85
bm.to_mesh(me)
bm.free()

if levels:
    mod = obj.modifiers.new('sub', 'SUBSURF')
    mod.levels = mod.render_levels = levels
    mod.boundary_smooth = 'PRESERVE_CORNERS'
    bpy.ops.object.modifier_apply(modifier=mod.name)
if target:
    # Back down to `target` triangles: the rounding stays, the small, even faces go.
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.quads_convert_to_tris()
    bpy.ops.object.mode_set(mode='OBJECT')
    mod = obj.modifiers.new('dec', 'DECIMATE')
    mod.ratio = min(1, target / len(obj.data.polygons))
    mod.use_symmetry = True
    mod.symmetry_axis = 'X'
    bpy.ops.object.modifier_apply(modifier=mod.name)

bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.to_mesh(obj.data)
after = len(bm.faces)
bm.free()

bpy.ops.object.shade_smooth_by_angle(angle=crease)
obj.data.materials.clear()
bpy.ops.export_scene.gltf(
    filepath=dst, export_format='GLB', use_selection=True,
    export_texcoords=False, export_normals=True, export_materials='NONE',
    export_attributes=False, export_apply=True, export_yup=True,
)
print(f'HERO {src} -> {dst}: {before} faces -> {after} triangles, {len(obj.data.vertices)} verts')
