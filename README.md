# CCNS · 3D Showcase — IPv4 & IPv6 Subnetting Simulator

A premium 3D website for the CCNS (21ECC402P) project, built with **React + Vite + three.js**
(`@react-three/fiber` v8, `@react-three/drei` v9, `@react-three/postprocessing` v2).

* **Hero** – 192.168.1.10 as 32 glowing 3D bits; the CIDR prefix sweeps and the bits flip between network (blue) and host (orange).
* **Live demo** – the project's addressing / subnetting / routing logic, ported to JavaScript (BigInt, IPv4 + IPv6).
  Change the network and the 3D topology (Internet → Router → Switches → PCs) rebuilds; pick any source and destination and a packet travels the real path with a hop-by-hop explanation and TTL.
* **Download** – the original Python/Streamlit project is served from `/public/project`.

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/
npm run preview
```
Requires Node 18+.

## Deploy to Vercel
**Option A – dashboard:** push this folder to GitHub → vercel.com → *Add New → Project* → import the repo → *Deploy*.
Vercel auto-detects Vite (`npm run build`, output `dist`) — `vercel.json` already sets this.

**Option B – CLI:**
```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

## Structure
```
src/lib/net.js          IPv4/IPv6 engine (parse, subnet, topology, BFS routing, explanations)
src/three/HeroCanvas    hero scene (bits, orbiter, sparkles, bloom)
src/three/DemoCanvas    live-demo canvas (camera fit, orbit controls, post-processing)
src/three/Network3D     router / switch / PC / cloud meshes, links, animated packet
src/ui/*                page sections + live demo panel
public/project/*        downloadable Python project
```

## Notes
* WebGL is paused when a canvas is off-screen, `prefers-reduced-motion` is respected, touch devices use an auto-orbit
  camera instead of OrbitControls so the page still scrolls, and a fallback message shows if WebGL is unavailable.
* `three` is pinned to the 0.169 line, the range supported by R3F v8 / drei v9 / postprocessing v2.
  `.npmrc` sets `legacy-peer-deps=true` so installs don't fail on peer-range noise.
