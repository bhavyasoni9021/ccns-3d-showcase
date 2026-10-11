import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line, RoundedBox } from '@react-three/drei'
import { linkPoints } from './geometry'

const PINK = '#ff4d6d'
const SPEED = 3.4 // world units per second

/* ------------------------------------------------------------- small pieces */
function Label({ y = -0.95, dim, children }) {
  return (
    <Html position={[0, y, 0]} center distanceFactor={9} pointerEvents="none" zIndexRange={[20, 0]}>
      <div className={`lbl${dim ? ' dim' : ''}`}>{children}</div>
    </Html>
  )
}

function Ring({ r, active }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * 0.06)
  })
  if (!active) return null
  return (
    <mesh ref={ref} rotation-x={Math.PI / 2}>
      <torusGeometry args={[r, 0.045, 12, 72]} />
      <meshBasicMaterial color={PINK} toneMapped={false} />
    </mesh>
  )
}

/* -------------------------------------------------------------------- nodes */
function InternetNode({ node, dim, active }) {
  const g = useRef()
  const wire = useRef()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (g.current) g.current.position.y = node.pos[1] + Math.sin(t * 0.9) * 0.08
    if (wire.current) { wire.current.rotation.y = t * 0.25; wire.current.rotation.x = t * 0.12 }
  })
  const blobs = [[0, 0, 0, 0.95], [-0.85, -0.2, 0.1, 0.65], [0.85, -0.15, -0.1, 0.72], [0.3, 0.38, 0.2, 0.55], [-0.4, 0.3, -0.25, 0.5]]
  return (
    <group ref={g} position={node.pos}>
      {blobs.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[r, 32, 32]} />
          <meshStandardMaterial color="#a5b4fc" emissive="#6366f1" emissiveIntensity={dim ? 0.25 : 0.9} roughness={0.35} metalness={0.1} />
        </mesh>
      ))}
      <mesh ref={wire}>
        <icosahedronGeometry args={[1.9, 1]} />
        <meshBasicMaterial color="#818cf8" wireframe transparent opacity={dim ? 0.1 : 0.3} />
      </mesh>
      <Ring r={2.15} active={active} />
      <Label y={-1.6} dim={dim}>Internet<small>ISP {node.ip}</small></Label>
    </group>
  )
}

function RouterNode({ node, dim, active, gateways }) {
  const orbit = useRef()
  useFrame((_, dt) => { if (orbit.current) orbit.current.rotation.y += dt * 1.1 })
  return (
    <group position={node.pos}>
      <mesh>
        <cylinderGeometry args={[0.8, 0.9, 0.55, 48]} />
        <meshStandardMaterial color="#2563eb" emissive="#1d4ed8" emissiveIntensity={dim ? 0.3 : 0.9} roughness={0.3} metalness={0.3} />
      </mesh>
      <mesh position-y={0.31}>
        <cylinderGeometry args={[0.55, 0.55, 0.08, 48]} />
        <meshStandardMaterial color="#93c5fd" emissive="#60a5fa" emissiveIntensity={dim ? 0.4 : 1.8} toneMapped={false} />
      </mesh>
      <group ref={orbit}>
        <mesh position={[1.3, 0.1, 0]}>
          <sphereGeometry args={[0.11, 16, 16]} />
          <meshBasicMaterial color="#7dd3fc" toneMapped={false} />
        </mesh>
      </group>
      <Ring r={1.5} active={active} />
      <Label y={-1} dim={dim}>R1<small>Router · {gateways} gateways</small></Label>
    </group>
  )
}

function SwitchNode({ node, dim, active, color, index }) {
  return (
    <group position={node.pos}>
      <group rotation-y={node.rotY}>
        <RoundedBox args={[1.7, 0.42, 1]} radius={0.08} smoothness={4}>
          <meshStandardMaterial color="#0f766e" emissive="#14b8a6" emissiveIntensity={dim ? 0.2 : 0.55} roughness={0.35} metalness={0.3} />
        </RoundedBox>
        <mesh position={[0, 0.22, 0]}>
          <boxGeometry args={[1.5, 0.03, 0.8]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={dim ? 0.35 : 1} />
        </mesh>
        {[-0.5, -0.17, 0.17, 0.5].map((x) => (
          <mesh key={x} position={[x, 0, 0.51]}>
            <boxGeometry args={[0.18, 0.1, 0.02]} />
            <meshBasicMaterial color="#99f6e4" toneMapped={false} />
          </mesh>
        ))}
      </group>
      <Ring r={1.25} active={active} />
      <Label y={-0.7} dim={dim}>{node.label} · Subnet {index + 1}<small>{node.cidr}</small></Label>
    </group>
  )
}

function PCNode({ node, dim, active, color }) {
  return (
    <group position={node.pos}>
      <group rotation-y={node.rotY}>
        <RoundedBox args={[0.85, 0.58, 0.07]} radius={0.03} smoothness={3} position={[0, 0.48, 0]}>
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.4} />
        </RoundedBox>
        <mesh position={[0, 0.48, 0.045]}>
          <planeGeometry args={[0.74, 0.47]} />
          <meshStandardMaterial color="#000000" emissive={color} emissiveIntensity={dim ? 0.35 : 1.6} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 0.26, 12]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.46, 0.04, 0.3]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      </group>
      <Ring r={0.85} active={active} />
      <Label y={-0.3} dim={dim}>{node.label}<small>{node.ip}</small></Label>
    </group>
  )
}

/* -------------------------------------------------- floor zones and links */
function Zones({ topo, hasPath, onPath }) {
  return topo.subnets.map((s) => {
    const used = !hasPath || s.pcIds.some((p) => onPath.has(p)) || onPath.has(s.switchId)
    return (
      <group key={s.i} position={s.center}>
        <mesh rotation-x={-Math.PI / 2}>
          <circleGeometry args={[2.05, 64]} />
          <meshBasicMaterial color={s.color} transparent opacity={used ? 0.11 : 0.05} depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[2.0, 2.07, 96]} />
          <meshBasicMaterial color={s.color} transparent opacity={used ? 0.7 : 0.25} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
    )
  })
}

function Links({ topo, path }) {
  const geo = useMemo(() => topo.links.map(([a, b]) => ({ a, b, pts: linkPoints(topo, a, b) })), [topo])
  const hot = useMemo(() => {
    const s = new Set()
    for (let i = 1; i < path.length; i++) { s.add(`${path[i - 1]}|${path[i]}`); s.add(`${path[i]}|${path[i - 1]}`) }
    return s
  }, [path])
  return geo.map(({ a, b, pts }) => {
    const h = hot.has(`${a}|${b}`)
    return (
      <Line key={`${a}-${b}`} points={pts} color={h ? PINK : '#4a6bb5'} lineWidth={h ? 3.4 : 1.4}
        transparent opacity={h ? 1 : path.length > 1 ? 0.3 : 0.8} />
    )
  })
}

/* ------------------------------------------------------------------- packet */
const TRAIL = 10
function Packet({ hops, runId, onStep }) {
  const head = useRef()
  const trail = useRef([])
  const hist = useRef([])
  const st = useRef({ hop: 0, d: 0, wait: 1, done: false })
  const onStepRef = useRef(onStep)
  onStepRef.current = onStep

  const lens = useMemo(
    () => hops.map((pts) => {
      const seg = []
      let tot = 0
      for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); seg.push(l); tot += l }
      return { seg, tot }
    }), [hops])

  useEffect(() => {
    st.current = { hop: 0, d: 0, wait: 1.0, done: false }
    hist.current = []
    if (head.current && hops[0]) head.current.position.copy(hops[0][0])
    onStepRef.current(0)
  }, [hops, runId])

  useFrame((state, dtRaw) => {
    const h = head.current
    if (!h || !hops.length) return
    const dt = Math.min(dtRaw, 0.05)
    const s = st.current
    h.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 8) * 0.12)
    if (!s.done) {
      if (s.wait > 0) {
        s.wait -= dt
      } else {
        const { seg, tot } = lens[s.hop]
        s.d += dt * SPEED
        if (s.d >= tot) {
          const pts = hops[s.hop]
          h.position.copy(pts[pts.length - 1])
          s.hop += 1
          s.d = 0
          onStepRef.current(s.hop)
          if (s.hop >= hops.length) s.done = true
          else s.wait = 1.1
        } else {
          let d = s.d
          let i = 0
          while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++ }
          const f = seg[i] ? d / seg[i] : 1
          h.position.lerpVectors(hops[s.hop][i], hops[s.hop][i + 1], f)
        }
      }
    }
    const hs = hist.current
    hs.unshift(h.position.clone())
    if (hs.length > 60) hs.pop()
    trail.current.forEach((m, k) => {
      const p = hs[Math.min(hs.length - 1, (k + 1) * 3)]
      if (m && p) m.position.copy(p)
    })
  })

  return (
    <group>
      <mesh ref={head}>
        <sphereGeometry args={[0.2, 24, 24]} />
        <meshStandardMaterial color="#000000" emissive={PINK} emissiveIntensity={4} toneMapped={false} />
        <pointLight color={PINK} intensity={8} distance={5} />
      </mesh>
      {Array.from({ length: TRAIL }, (_, k) => (
        <mesh key={k} ref={(el) => { trail.current[k] = el }}>
          <sphereGeometry args={[0.16 * (1 - k / 12), 12, 12]} />
          <meshBasicMaterial color="#ff7a93" transparent opacity={0.55 * (1 - k / TRAIL)} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/* --------------------------------------------------------------------- main */
export default function Network3D({ topo, path, step, runId, onStep }) {
  const hasPath = path.length > 1
  const onPath = useMemo(() => new Set(path), [path])
  const activeId = hasPath ? path[step] : null
  const hops = useMemo(
    () => (hasPath ? path.slice(1).map((id, i) => linkPoints(topo, path[i], id)) : []),
    [topo, path, hasPath])
  const colorOf = (n) => topo.subnets[n.subnet]?.color

  return (
    <group>
      <Zones topo={topo} hasPath={hasPath} onPath={onPath} />
      <Links topo={topo} path={path} />
      {Object.values(topo.nodes).map((n) => {
        const dim = hasPath && !onPath.has(n.id)
        const active = activeId === n.id
        if (n.kind === 'internet') return <InternetNode key={n.id} node={n} dim={dim} active={active} />
        if (n.kind === 'router') return <RouterNode key={n.id} node={n} dim={dim} active={active} gateways={topo.subnets.length} />
        if (n.kind === 'switch') return <SwitchNode key={n.id} node={n} dim={dim} active={active} color={colorOf(n)} index={n.subnet} />
        return <PCNode key={n.id} node={n} dim={dim} active={active} color={colorOf(n)} />
      })}
      {hasPath && <Packet hops={hops} runId={runId} onStep={onStep} />}
    </group>
  )
}
