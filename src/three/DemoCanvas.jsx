import { useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import Network3D from './Network3D'
import { isCoarsePointer, prefersReducedMotion } from '../lib/env'

const TARGET = [0, 0.8, 0]

/** camera distance that keeps the whole network in frame for this canvas shape (tested against three.js) */
function useFitDist(nSub) {
  const size = useThree((s) => s.size)
  const aspect = size.width / Math.max(1, size.height)
  return (12 + nSub * 0.95) * Math.max(1, 1.45 / aspect) * 1.08
}

function SceneFog({ nSub }) {
  const dist = useFitDist(nSub)
  return <fog attach="fog" args={['#050813', dist * 0.9, dist * 2.8]} />
}

/** desktop: keep the user's orbit angle but re-fit the distance when the canvas or network changes */
function FitCamera({ nSub }) {
  const dist = useFitDist(nSub)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const dx = camera.position.x - TARGET[0]
    const dy = camera.position.y - TARGET[1]
    const dz = camera.position.z - TARGET[2]
    const len = Math.hypot(dx, dy, dz) || 1
    camera.position.set(TARGET[0] + (dx / len) * dist, TARGET[1] + (dy / len) * dist, TARGET[2] + (dz / len) * dist)
  }, [dist, camera])
  return null
}

/** touch devices: no OrbitControls (it would block page scrolling) — slow auto-orbit instead */
function AutoOrbit({ nSub, reduced }) {
  const dist = useFitDist(nSub)
  useFrame(({ camera, clock }) => {
    const a = reduced ? 0 : clock.elapsedTime * 0.12
    camera.position.set(Math.sin(a) * dist, 4.2, Math.cos(a) * dist)
    camera.lookAt(...TARGET)
  })
  return null
}

export default function DemoCanvas({ topo, path, step, runId, onStep, visible }) {
  const coarse = isCoarsePointer()
  const reduced = prefersReducedMotion()
  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={visible ? 'always' : 'never'}
      camera={{ position: [0, 4.2, 12 + topo.nSub * 0.95], fov: 45, near: 0.1, far: 200 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#050813']} />
      <SceneFog nSub={topo.nSub} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 6]} intensity={1.5} />
      <directionalLight position={[-6, 3, -4]} intensity={0.7} color="#a78bfa" />

      <Grid position={[0, -2.1, 0]} args={[40, 40]} cellSize={1} cellThickness={0.6} cellColor="#1b2848"
        sectionSize={5} sectionThickness={1} sectionColor="#2f4a8a" fadeDistance={34} fadeStrength={1.6} infiniteGrid />

      <Network3D topo={topo} path={path} step={step} runId={runId} onStep={onStep} />

      {coarse ? (
        <AutoOrbit nSub={topo.nSub} reduced={reduced} />
      ) : (
        <>
        <FitCamera nSub={topo.nSub} />
        <OrbitControls enableZoom={false} enablePan={false} target={TARGET}
          autoRotate={!reduced} autoRotateSpeed={0.5} minPolarAngle={0.85} maxPolarAngle={1.6} />
        </>
      )}

      <EffectComposer multisampling={4}>
        <Bloom intensity={1.1} luminanceThreshold={0.35} luminanceSmoothing={0.25} mipmapBlur />
        <Noise opacity={0.035} />
        <Vignette eskil={false} offset={0.2} darkness={0.85} />
      </EffectComposer>
    </Canvas>
  )
}
