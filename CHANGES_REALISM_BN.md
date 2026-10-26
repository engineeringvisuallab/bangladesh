# Realistic trees + grass + flowers (4K textures)

## Grass (src/vegetation/GrassAssets.ts, GrassManager.ts, core/Config.ts)
- 10 tuft types (TreeTypes.GrassType): lawn, wild (tall), clump (broad leaf), seed-grass, and 6 flower types:
  daisy, buttercup, lavender, poppy, cornflower, clover. Flowers are real petal heads on stems, not dots.
- Denser: cell 0.5 m -> 0.32 m (2.4x), maxChance 0.98, minChance 0.6, forestThin 0.3.
- Flowers grow in patches (value noise, ~25 m), one main species per patch + 30 % mixed. Config: flowerInPatch, flowerScatter.
- Blades: 5 triangles, root->tip brightness, per-blade tint (green / yellow-green / straw), side-tilted normals.
- Low-end GPU: lower Config.vegetation.grass.bladeDensity (e.g. 0.6) or raise `cell`.

## Trees (src/vegetation/TreeAssets.ts, TreeTypes.ts, TreePlacement.ts, TreePhysics.ts)
- Trees are GROWN: trunk -> primary limbs -> secondary -> twigs (golden-angle spiral, bend/droop), root buttresses, leaf clusters at twig tips.
- 4 broadleaf shapes (round, oak, vase, slender) + savanna tree (acacia) + pine. New kinds: oak=3, vase=4, slender=5 (TREE_KIND_COUNT = 6).
- Tree positions did not change (new random draw is taken last).
- Atlas 4096 x 1024 (4K wide): more leaves, veins, darker inner crown.

## Ground (src/terrain/GroundTextures.ts)
- Ground detail textures 512 -> 1024, more blades / soil grains.

## Tests
- npm run test:trees / test:tree-physics / test:grass-rocks / test:tree-destruction all pass; npm run build OK.

## Leaves v2 (src/vegetation/TreeAssets.ts)
- Atlas 5 tiles (4000 x 800): bark, ovate serrated leaf sprays, needles, lobed (palmate) leaf sprays, dense mass (far LOD).
- Every leaf is painted one by one (shape, veins, darker rim, petiole); sprays have transparent gaps, so branches show through.
- Leaf cards lie mostly flat (face up/out), spray tips point away from the crown centre; per-card hue variation by vertex tint.
- Shader: light through leaves (translucency), soft sheen, per-branch sway + per-leaf flutter. Oak uses lobed leaves, other broadleaf kinds ovate.
