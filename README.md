# 251213_FerrofluidFields

This repository explores ferrofluid-inspired reaction–diffusion behavior modulated by virtual magnets, targeting an interactive Three.js visualizer for design, research, and education.

## Features
- Gray–Scott reaction–diffusion ping-pong simulation mapped to a chrome-like height visualization.
- Magnet points that modulate the RD growth mask; add, drag, and tune strength live.
- Draggable sci-fi control panel with sliders for feed/kill/diffusion/iterations/threshold plus reseed/reset actions.
- Vite + TypeScript + Three.js scaffold ready for shader iteration and UI polish.

## Getting Started
1. Clone the repository: `git clone https://github.com/ekimroyrp/251213_FerrofluidFields.git`
2. Move into the project: `cd 251213_FerrofluidFields`
3. Install dependencies: `npm install`
4. Start the dev server: `npm run dev` then open the shown localhost URL.
5. Build for production: `npm run build` (outputs to `dist/`).

## Controls
- Feed/Kill/Diffusion U/Diffusion V: tune RD chemistry parameters.
- Iterations: number of simulation steps per user change.
- Field Threshold: how strong the magnet field must be before patterns grow.
- Reseed: randomize RD initialization; Clear Magnets: remove all magnets.
- + Add Magnet: spawn a draggable magnet with adjustable strength; drag on canvas to reposition.
