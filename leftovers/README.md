# Leftovers: the picnic toy-box theme

The game's first look — a toy box on a picnic blanket: fruit defenders, toy bugs, a toy train on a
ring track, a marshmallow fence, sticker UI. Retired on 2026-11-02 when the sci-fi bug swarm (first
built behind `?theme=scifi` in commit `71d12df`) became the only look. Kept here for reference and
reuse; nothing in this folder is built, type-checked or shipped (tsconfig only covers `src` and
`scripts`, Vite only bundles what `src` imports).

| Where | What |
| --- | --- |
| `assets/models`, `assets/rigs` | Tripo GLB models and rigged bugs (ant, beetle, fly, snail, locust king, dino, robot, soldier, train, cake) |
| `assets/ui` | Sticker UI art: stat icons, buttons, bar/panel/badge frames, hero ring |
| `docs/art` | Art rounds: `style_r*`, `chars_r*`, `tripo_r*`, `ui_r1`, the style frame and references |
| `src/` | Source snapshots at `71d12df`: `view/models.ts`, `scene.ts`, `meshes.ts`, `icons.ts`, `units.ts`, `theme.ts`, and `style.css` with the sticker skin |
| `scripts/art` | Picnic tooling: GLB decimate and bug rigging (Blender), sticker UI cutting/assembly/mock-up |

To see the picnic game running, check out `71d12df` and open it without `?theme=scifi`.
