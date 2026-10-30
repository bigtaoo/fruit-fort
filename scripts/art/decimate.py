"""
Cut a model's triangle count with Blender's collapse decimation, for meshes that show small on screen.

    blender -b --python scripts/art/decimate.py -- <in.glb> <out.glb> <triangles>

The originals Tripo exported stay in docs/art/tripo_r*; this works on the game copies in
src/assets/models. Vertex colours are painted in code from vertex positions, so only shape is kept.
"""
import sys
import bpy

src, dst, target = sys.argv[sys.argv.index('--') + 1:][:3]
target = int(target)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    o.data.calc_loop_triangles()
    tris = len(o.data.loop_triangles)
    if tris > target:
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new('lod', 'DECIMATE')
        mod.ratio = target / tris
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    o.data.calc_loop_triangles()
    print(f'LOD {src} {tris} -> {len(o.data.loop_triangles)}')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_texcoords=False, export_materials='NONE', export_yup=True)
