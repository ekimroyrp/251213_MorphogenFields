# 251213_MorphogenFields

MorphogenFields explores ferrofluid-inspired Gray-Scott reaction–diffusion modulated by draggable virtual magnets, rendered as a 2D chrome heightmap with optional pure heightfield view. A sci-fi control deck (metallic greyscale + orange) drives chemistry, magnet layout, and visual modes, with on-demand PNG export.

## Features
- Gray-Scott RD ping-pong in Three.js/TypeScript with magnet-field modulation; seed/percentage reset to defaults on refresh for reproducibility.
- Visual modes: Environment (chrome lighting) vs. Heightfield (true grayscale), plus Rough (linear) vs. Smooth (linear + light blur) filtering; Export button saves a PNG of the canvas only.
- Magnet UX: add via canvas LMB, delete via RMB, toggle state via MMB, strength/reach sliders + numeric inputs, numbered glowing handles, state on/off styling, live replay to iteration count.
- Iteration UX: compact +/- arrows for single-step changes, Smooth/Rough/Environment/Heightfield toggles, collapsed-by-default panel with top/bottom grab bars, custom dotted/outlined sliders and numeric inputs.
- Vite + TypeScript + Three.js scaffold with relative asset base for GitHub Pages; state persistence for params and panel placement, magnets reset to a centered default on refresh.

## Getting Started
1. Clone: `git clone https://github.com/ekimroyrp/251213_MorphogenFields.git`
2. `cd 251213_MorphogenFields`
3. Install: `npm install`
4. Dev server: `npm run dev` (open shown localhost URL)
5. Build: `npm run build` (outputs to `dist/`)

## Controls
- **Environment / Heightfield:** switch between chrome lighting and pure grayscale height.
- **Smooth / Rough:** Smooth applies linear + light blur; Rough uses linear only.
- **Iterations:** set target steps; use the left/right arrows for +/-1 stepping.
- **Feed / Kill / Diffusion U / Diffusion V / Threshold / Percentage / Seed / Resolution:** tune chemistry and grid; defaults restored on refresh for core params.
- **Magnets:** LMB on canvas to add, RMB on handle to delete, MMB to toggle state; drag to move; adjust Strength/Reach sliders or numeric inputs; Clear Magnets resets and renumbers.
- **Export:** saves a PNG of the simulation (UI and magnet handles excluded).

## Deployment
- **Local production preview:** `npm install`, then `npm run build` followed by `npm run preview` to inspect the compiled bundle.
- **Publish to GitHub Pages:** With `base: "./"` already set, build (`npm run build`), checkout `gh-pages` (separate worktree recommended), copy the contents of `dist/` to the branch root, add a `.nojekyll`, commit, and `git push origin gh-pages`.
- **Live demo:** https://ekimroyrp.github.io/251213_MorphogenFields/
