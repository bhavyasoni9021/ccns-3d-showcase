import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Float, Html, Sparkles } from '@react-three/drei'
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import { prefersReducedMotion } from '../lib/env'

// 192.168.1.10 as 32 glowing bits: tall bar = 1, flat tile = 0.
const OCTETS = [192, 168, 1, 10]
const BITS = OCTETS.flatMap((o) => o.toString(2).padStart(8, '0').split('').map(Number))
const C_NET = new THREE.Color('#38bdf8')
const C_HOST = new THREE.Color('#fb923c')

function Bit({ i, value, prefixRef, reduced }) {
  const mesh = useRef()
  const mat = useRef()
  const row = Math.floor(i / 8)
  const col = i % 8
  const x = (col - 3.5) * 0.6 + (col >= 4 ? 0.14 : -0.14)
  const y = (1.5 - row) * 0.8
  useFrame(({ clock }, dt) => {
    const m = mat.current
    if (!m || !mesh.current) return
    const net = i < prefixRef.current
    const k = Math.min(1, dt * 6)
    m.color.lerp(net ? C_NET : C_HOST, k)
    m.emissive.copy(m.color)
    m.emissiveIntensity += ((net ? 1.5 : 0.95) * (value ? 1 : 0.45) - m.emissiveIntensity) * k
    mesh.current.position.z = reduced ? 0 : Math.sin(clock.elapsedTime * 1.3 + i * 0.45) * 0.12
  })
  return (
    <mesh ref={mesh} position={[x, y, 0]}>
      <boxGeometry args={[0.46, 0.46, value ? 0.9 : 0.22]} />
      <meshStandardMaterial ref={mat} color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1} roughness={0.35} metalness={0.2} />
    </mesh>
  )
}

function BitGrid({ reduced }) {
  const prefixRef = useRef(24)
  const [label, setLabel] = useState(24)
  useFrame(({ clock }) => {
    if (reduced) return
    const p = Math.round(8 + (Math.sin(clock.elapsedTime * 0.32) * 0.5 + 0.5) * 20)
    if (p !== prefixRef.current) { prefixRef.current = p; setLabel(p) }
  })
  return (
    <Float speed={reduced ? 0 : 1.2} rotationIntensity={0.25} floatIntensity={0.6}>
      <group rotation={[-0.28, -0.5, 0.05]}>
        {BITS.map((b, i) => <Bit key={i} i={i} value={b} prefixRef={prefixRef} reduced={reduced} />)}
        {OCTETS.map((o, r) => (
          <Html key={r} position={[-3.5, (1.5 - r) * 0.8, 0]} center pointerEvents="none" zIndexRange={[5, 0]}>
            <span className="oct">{o}</span>
          </Html>
        ))}
        <Html position={[0, 2.5, 0]} center pointerEvents="none" zIndexRange={[5, 0]}>
          <div className="cidr-tag">
            <b>192.168.1.10<em>/{label}</em></b>
            <span><i className="dot net" />{label} network bits &nbsp;<i className="dot host" />{32 - label} host bits</span>
          </div>
        </Html>
      </group>
    </Float>
  )
}

function Orbiter({ reduced }) {
  const g = useRef()
  useFrame((_, dt) => { if (g.current && !reduced) g.current.rotation.z += dt * 0.5 })
  return (
    <group rotation={[1.15, 0.25, 0]}>
      <mesh>
        <torusGeometry args={[4.3, 0.012, 8, 220]} />
        <meshBasicMaterial color="#8b5cf6" toneMapped={false} />
      </mesh>
      <group ref={g}>
        <mesh position={[4.3, 0, 0]}>
          <sphereGeometry args={[0.13, 16, 16]} />
          <meshStandardMaterial color="#000" emissive="#ff4d6d" emissiveIntensity={4} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Wire({ position, radius, speed, color }) {
  const ref = useRef()
  useFrame((_, dt) => { if (ref.current) { ref.current.rotation.y += dt * speed; ref.current.rotation.x += dt * speed * 0.6 } })
  return (
    <mesh ref={ref} position={position}>
      <icosahedronGeometry args={[radius, 1]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.28} />
    </mesh>
  )
}

function Rig() {
  useFrame(({ camera, pointer }, dt) => {
    const k = Math.min(1, dt * 2)
    camera.position.x += (pointer.x * 0.9 - camera.position.x) * k
    camera.position.y += (pointer.y * 0.55 - camera.position.y) * k
    camera.lookAt(0, 0, 0)
  })
  return null
}

function Scene({ reduced }) {
  const size = useThree((s) => s.size)
  const mobile = size.width < 860
  return (
    <>
      <group position={mobile ? [0, -1.7, 0] : [3.3, 0, 0]} scale={mobile ? 0.52 : 0.95}>
        <BitGrid reduced={reduced} />
        <Orbiter reduced={reduced} />
      </group>
      <Wire position={[-6, 2.6, -5]} radius={1.6} speed={0.12} color="#6366f1" />
      <Wire position={[7, -3, -6]} radius={2.2} speed={0.08} color="#22d3ee" />
      <Sparkles count={mobile ? 50 : 110} scale={[18, 10, 10]} size={2.6} speed={reduced ? 0 : 0.3} color="#7dd3fc" />
      {!reduced && <Rig />}
    </>
  )
}

export default function HeroCanvas({ visible = true }) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  return (
    <Canvas dpr={[1, 1.6]} frameloop={visible ? 'always' : 'never'}
      camera={{ position: [0, 0, 12], fov: 40 }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 6]} intensity={1.6} />
      <directionalLight position={[-6, -2, 3]} intensity={0.8} color="#8b5cf6" />
      <Scene reduced={reduced} />
      <EffectComposer multisampling={4}>
        <Bloom intensity={1.25} luminanceThreshold={0.3} luminanceSmoothing={0.3} mipmapBlur />
        <Noise opacity={0.04} />
        <Vignette eskil={false} offset={0.15} darkness={0.9} />
      </EffectComposer>
    </Canvas>
  )
}
