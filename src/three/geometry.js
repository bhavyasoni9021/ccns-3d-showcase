import * as THREE from 'three'

const ORDER = { internet: 0, router: 1, switch: 2, pc: 3 }

/** Polyline for the link a→b (works in either direction). Router→switch links are arcs. */
export function linkPoints(topo, a, b) {
  const na = topo.nodes[a]
  const nb = topo.nodes[b]
  const fwd = ORDER[na.kind] < ORDER[nb.kind]
  const p = fwd ? na : nb
  const q = fwd ? nb : na
  const P = new THREE.Vector3(...p.anchor)
  const Q = new THREE.Vector3(...q.anchor)
  let pts
  if (p.kind === 'router' && q.kind === 'switch') {
    const c = new THREE.Vector3(Q.x * 0.92, P.y - 0.15, Q.z * 0.92)
    pts = new THREE.QuadraticBezierCurve3(P, c, Q).getPoints(28)
  } else {
    pts = [P, Q]
  }
  return fwd ? pts : pts.slice().reverse()
}
