# 251213_FerrofluidFields

This repository explores ferrofluid-inspired reaction–diffusion behavior modulated by virtual magnets, targeting an interactive Three.js visualizer for design, research, and education. The output is a 2D chrome-like heightmap on a white field, updating when you reseed or adjust chemistry/magnet controls.

## Features
- Gray–Scott reaction–diffusion ping-pong simulation mapped to a chrome-like height visualization rendered in Three.js.
- Magnet points modulate growth: add/remove, drag on-canvas, tweak strength and radius, with optional live drag bursts.
- Draggable sci-fi control panel (metallic greyscale with orange accents) hosting chemistry sliders, threshold, reseed/reset, and magnet list.
- Local state persistence for parameters, magnets, and panel position between sessions.
- Vite + TypeScript + Three.js scaffold for rapid shader/UI iteration.

## Getting Started
1. Clone the repository: `git clone https://github.com/ekimroyrp/251213_FerrofluidFields.git`
2. Move into the project: `cd 251213_FerrofluidFields`
3. Install dependencies: `npm install`
4. Start the dev server: `npm run dev` then open the shown localhost URL.
5. Build for production: `npm run build` (outputs to `dist/`).

## Controls
- Feed/Kill/Diffusion U/Diffusion V: tune RD chemistry parameters.
- Iterations: number of simulation steps per user change (higher = sharper, slower).
- Field Threshold: how strong the magnet field must be before patterns grow.
- Reseed: randomize RD initialization; Clear Magnets: remove all magnets.
- + Add Magnet: spawn a draggable magnet with adjustable strength and radius; drag on canvas to reposition; remove via ✕ in the list.
