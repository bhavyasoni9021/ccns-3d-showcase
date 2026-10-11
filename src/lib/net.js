/**
 * net.js — IPv4 / IPv6 addressing, subnetting, topology and routing engine.
 * A dependency-free JavaScript (BigInt) port of the Python `netcore.py` used by
 * the Streamlit simulator, so the website can run the same logic live.
 */

/* ------------------------------------------------------------------ parsing */
export function parseV4(s) {
  const parts = String(s).trim().split('.')
  if (parts.length !== 4) return null
  let n = 0n
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    if (p.length > 1 && p[0] === '0') return null
    const v = Number(p)
    if (v > 255) return null
    n = (n << 8n) | BigInt(v)
  }
  return n
}

export function parseV6(s) {
  s = String(s).trim().toLowerCase()
  if (!s || !/^[0-9a-f:]+$/.test(s)) return null
  const dbl = s.split('::')
  if (dbl.length > 2) return null
  const groups = (str) => (str === '' ? [] : str.split(':'))
  const head = groups(dbl[0])
  const tail = dbl.length === 2 ? groups(dbl[1]) : []
  if (dbl.length === 1 && head.length !== 8) return null
  if (dbl.length === 2 && head.length + tail.length > 7) return null
  const fill = dbl.length === 2 ? Array(8 - head.length - tail.length).fill('0') : []
  let n = 0n
  for (const g of [...head, ...fill, ...tail]) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    n = (n << 16n) | BigInt(parseInt(g, 16))
  }
  return n
}

export function fmtV4(n) {
  return [24n, 16n, 8n, 0n].map((s) => Number((n >> s) & 255n)).join('.')
}

export function fmtV6(n) {
  const g = []
  for (let i = 7; i >= 0; i--) g.push(Number((n >> BigInt(i * 16)) & 0xffffn))
  let bestS = -1, bestL = 0, curS = -1, curL = 0
  for (let i = 0; i < 8; i++) {
    if (g[i] === 0) {
      if (curS < 0) { curS = i; curL = 0 }
      curL++
      if (curL > bestL) { bestL = curL; bestS = curS }
    } else curS = -1
  }
  const h = g.map((x) => x.toString(16))
  if (bestL < 2) return h.join(':')
  return h.slice(0, bestS).join(':') + '::' + h.slice(bestS + bestL).join(':')
}

export const fmt = (version, n) => (version === 4 ? fmtV4(n) : fmtV6(n))

export function expandV6(n) {
  const g = []
  for (let i = 7; i >= 0; i--) g.push(((n >> BigInt(i * 16)) & 0xffffn).toString(16).padStart(4, '0'))
  return g.join(':')
}

export function parseInput(version, ipText, prefix) {
  const text = String(ipText ?? '').trim()
  if (!text) throw new Error('Please enter an IP address.')
  if (text.includes('/') || text.includes('%'))
    throw new Error('Enter only the address here — the prefix length goes in the CIDR box.')
  const v4 = version === 'IPv4'
  const addr = v4 ? parseV4(text) : parseV6(text)
  if (addr === null) {
    const other = v4 ? parseV6(text) : parseV4(text)
    if (other !== null) throw new Error(`'${text}' is an IPv${v4 ? 6 : 4} address, but ${version} is selected.`)
    throw new Error(`'${text}' is not a valid ${version} address.`)
  }
  const bits = v4 ? 32 : 128
  if (prefix === '' || prefix === null || prefix === undefined) throw new Error('Enter a prefix length.')
  const p = Number(prefix)
  if (!Number.isInteger(p) || p < 0 || p > bits)
    throw new Error(`For ${version} the prefix must be between 0 and ${bits}.`)
  return { version: v4 ? 4 : 6, bits, addr, prefix: p }
}

/* ----------------------------------------------------------------- analysis */
const inRange = (addr, base, len, bits) => addr >> BigInt(bits - len) === base >> BigInt(bits - len)

export function addressType(version, a) {
  if (version === 4) {
    const r = (b, l) => inRange(a, parseV4(b), l, 32)
    if (a === 0n) return 'Unspecified'
    if (r('127.0.0.0', 8)) return 'Loopback'
    if (r('169.254.0.0', 16)) return 'Link-local'
    if (r('224.0.0.0', 4)) return 'Multicast'
    if (r('192.0.2.0', 24) || r('198.51.100.0', 24) || r('203.0.113.0', 24)) return 'Documentation range (not routable)'
    if (r('10.0.0.0', 8) || r('172.16.0.0', 12) || r('192.168.0.0', 16)) return 'Private (RFC 1918)'
    if (r('100.64.0.0', 10)) return 'Shared address space (CGNAT)'
    if (r('240.0.0.0', 4)) return 'Reserved'
    return 'Global / public'
  }
  const r = (b, l) => inRange(a, parseV6(b), l, 128)
  if (a === 0n) return 'Unspecified'
  if (a === 1n) return 'Loopback'
  if (r('fe80::', 10)) return 'Link-local'
  if (r('ff00::', 8)) return 'Multicast'
  if (r('2001:db8::', 32)) return 'Documentation prefix (example addresses)'
  if (r('fc00::', 7)) return 'Unique local (private)'
  if (r('2000::', 3)) return 'Global unicast'
  return 'Reserved / special-purpose'
}

export function ipv4Class(a) {
  const f = Number(a >> 24n)
  if (f < 128) return 'A (historical)'
  if (f < 192) return 'B (historical)'
  if (f < 224) return 'C (historical)'
  if (f < 240) return 'D (multicast)'
  return 'E (reserved)'
}

export function fmtCount(n, hostBits) {
  const s = n.toLocaleString('en-US')
  return hostBits > 16 ? `2^${hostBits} = ${s}` : s
}

function firstLast(version, network, last, prefix) {
  if (version === 4) {
    if (prefix === 32) return [network, network]
    if (prefix === 31) return [network, last]
    return [network + 1n, last - 1n]
  }
  return prefix >= 127 ? [network, last] : [network + 1n, last]
}

function usableCount(version, total, prefix) {
  if (version === 4) return prefix === 32 ? 1n : prefix === 31 ? 2n : total - 2n
  return prefix >= 127 ? total : total - 1n
}

export function analyze(a) {
  const { version, bits, addr, prefix } = a
  const hostBits = bits - prefix
  const full = (1n << BigInt(bits)) - 1n
  const hostMask = (1n << BigInt(hostBits)) - 1n
  const mask = full ^ hostMask
  const network = addr & mask
  const last = network | hostMask
  const total = 1n << BigInt(hostBits)
  const [first, lastUsable] = firstLast(version, network, last, prefix)
  const usable = usableCount(version, total, prefix)
  const f = (n) => fmt(version, n)
  return {
    version, bits, prefix, hostBits, addr, mask, network, last, total, usable,
    first, lastUsable,
    str: {
      ip: f(addr), mask: version === 4 ? fmtV4(mask) : f(mask), wildcard: version === 4 ? fmtV4(hostMask) : '',
      network: f(network), broadcast: version === 4 ? f(last) : '', last: f(last),
      first: f(first), lastUsable: f(lastUsable),
      total: fmtCount(total, hostBits), usable: fmtCount(usable, hostBits),
    },
    type: addressType(version, addr),
    klass: version === 4 ? ipv4Class(addr) : '',
  }
}

/* --------------------------------------------------------------- bit visuals */
function mergeRuns(tokens) {
  const out = []
  for (const [ch, cls] of tokens) {
    const l = out[out.length - 1]
    if (l && l.cls === cls) l.text += ch
    else out.push({ text: ch, cls })
  }
  return out
}

/** Rows of colour-coded bit segments. cls: net | sub | host | sep */
export function bitRows(version, value, prefix, subPrefix = null) {
  const bits = version === 4 ? 32 : 128
  const s = value.toString(2).padStart(bits, '0')
  const cls = (i) => (i < prefix ? 'net' : subPrefix !== null && i < subPrefix ? 'sub' : 'host')
  if (version === 4) {
    const t = []
    for (let i = 0; i < 32; i++) {
      if (i && i % 8 === 0) t.push(['.', 'sep'])
      t.push([s[i], cls(i)])
    }
    return [{ label: '', segs: mergeRuns(t) }]
  }
  const rows = []
  for (let h = 0; h < 8; h++) {
    const t = []
    for (let j = 0; j < 16; j++) {
      if (j && j % 4 === 0) t.push([' ', 'sep'])
      t.push([s[h * 16 + j], cls(h * 16 + j)])
    }
    rows.push({ label: ((value >> BigInt((7 - h) * 16)) & 0xffffn).toString(16).padStart(4, '0'), segs: mergeRuns(t) })
  }
  return rows
}

/* ------------------------------------------------------------- subnet table */
export function splitSubnets(an, nSub, limit = 16) {
  const k = Math.log2(nSub)
  const np = an.prefix + k
  const size = 1n << BigInt(an.bits - np)
  const rows = []
  for (let i = 0; i < Math.min(nSub, limit); i++) {
    const network = an.network + size * BigInt(i)
    const last = network + size - 1n
    const [first, lastUsable] = firstLast(an.version, network, last, np)
    rows.push({
      i: i + 1, network, prefix: np,
      cidr: `${fmt(an.version, network)}/${np}`,
      first: fmt(an.version, first), last: fmt(an.version, lastUsable),
      broadcast: an.version === 4 ? fmt(4, last) : '',
      usable: fmtCount(usableCount(an.version, size, np), an.bits - np),
      hasIp: an.addr >= network && an.addr <= last,
    })
  }
  return { prefix: np, rows }
}

/* ----------------------------------------------------------------- topology */
const WAN_V4 = ['203.0.113.0', '198.51.100.0', '192.0.2.0']
const WAN_V6 = ['2001:db8:ffff::', '3fff:ffff::', 'fd00:ffff::']
export const SUBNET_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#818cf8', '#2dd4bf', '#fb7185', '#a78bfa']

export function buildTopology(a, nSub, devicesWanted) {
  const k = Math.log2(nSub)
  if (!Number.isInteger(k) || nSub < 1) throw new Error('Number of subnets must be a power of two (1, 2, 4, 8).')
  const np = a.prefix + k
  const v = a.version
  const limit = a.bits - 2
  if (np > limit)
    throw new Error(
      `Splitting /${a.prefix} into ${nSub} subnets gives /${np}, which is too small for a gateway and a host ` +
      `(largest usable prefix is /${limit}). Use a shorter prefix or fewer subnets.`)

  const an = analyze(a)
  const size = 1n << BigInt(a.bits - np)
  const usableHosts = v === 4 ? size - 2n : size - 1n
  const maxDev = Number(usableHosts - 1n > 64n ? 64n : usableHosts - 1n)
  const devs = Math.max(1, Math.min(devicesWanted, maxDev))
  const notes = []
  if (devs < devicesWanted)
    notes.push(`Each /${np} subnet can only hold ${devs} end device(s) besides the gateway, so devices per subnet was reduced.`)

  // WAN link that does not overlap the user's network
  const wanSize = v === 4 ? 4n : 1n << 64n
  let wanNet = null
  for (const c of v === 4 ? WAN_V4 : WAN_V6) {
    const cn = v === 4 ? parseV4(c) : parseV6(c)
    if (cn + wanSize - 1n < an.network || cn > an.last) { wanNet = cn; break }
  }
  const wanPrefix = v === 4 ? 30 : 64
  const wan = {
    net: `${fmt(v, wanNet)}/${wanPrefix}`, peer: fmt(v, wanNet + 1n), router: fmt(v, wanNet + 2n),
    iface: `Gi0/${nSub}`, prefix: wanPrefix,
  }

  const nodes = {}, links = [], subnets = [], routes = [], ifaces = []
  nodes.INET = { id: 'INET', kind: 'internet', label: 'Internet', ip: wan.peer, pos: [0, 4.4, 0], anchor: [0, 4.4, 0], rotY: 0 }
  nodes.R1 = { id: 'R1', kind: 'router', label: 'R1', ip: '', pos: [0, 2.1, 0], anchor: [0, 2.1, 0], rotY: 0 }
  links.push(['INET', 'R1'])

  const R = nSub === 1 ? 0 : 2.6 + nSub * 0.42
  let pcNo = 0
  for (let i = 0; i < nSub; i++) {
    const net = an.network + size * BigInt(i)
    const th = Math.PI / 2 + (2 * Math.PI * i) / nSub
    const rad = [Math.cos(th), 0, Math.sin(th)]
    const tan = [-Math.sin(th), 0, Math.cos(th)]
    const swPos = [R * rad[0], 0, R * rad[2]]
    const swId = `SW${i + 1}`
    const cidr = `${fmt(v, net)}/${np}`
    nodes[swId] = { id: swId, kind: 'switch', label: swId, ip: '', cidr, subnet: i, pos: swPos, anchor: swPos, rotY: th * -1 + Math.PI / 2 }
    links.push(['R1', swId])
    const gw = fmt(v, net + 1n)
    const pcIds = []
    for (let d = 0; d < devs; d++) {
      pcNo++
      const id = `PC${pcNo}`
      const off = (d - (devs - 1) / 2) * 1.05
      const pos = [swPos[0] + rad[0] * 1.5 + tan[0] * off, -1.6, swPos[2] + rad[2] * 1.5 + tan[2] * off]
      nodes[id] = {
        id, kind: 'pc', label: id, ip: fmt(v, net + 2n + BigInt(d)), prefix: np, gateway: gw, subnet: i,
        pos, anchor: [pos[0], pos[1] + 0.45, pos[2]], rotY: Math.atan2(rad[0], rad[2]),
      }
      links.push([swId, id])
      pcIds.push(id)
    }
    const iface = `Gi0/${i}`
    subnets.push({
      i, cidr, gateway: gw, switchId: swId, pcIds, iface, color: SUBNET_COLORS[i % 8],
      center: [swPos[0] + rad[0] * 0.8, -2.05, swPos[2] + rad[2] * 0.8],
    })
    ifaces.push({ iface, ip: gw, prefix: np, neighbor: swId })
    routes.push({ code: 'C', dest: cidr, next: 'directly connected', iface })
  }
  ifaces.push({ iface: wan.iface, ip: wan.router, prefix: wanPrefix, neighbor: 'INET' })
  routes.push({ code: 'C', dest: wan.net, next: 'directly connected', iface: wan.iface })
  routes.push({ code: 'S*', dest: v === 4 ? '0.0.0.0/0' : '::/0', next: wan.peer, iface: wan.iface })

  return { version: v, an, newPrefix: np, nSub, devs, nodes, links, subnets, ifaces, routes, wan, notes }
}

/* ------------------------------------------------------------------ routing */
export function findPath(topo, src, dst) {
  if (!topo.nodes[src] || !topo.nodes[dst]) return []
  const adj = {}
  Object.keys(topo.nodes).forEach((k) => (adj[k] = []))
  topo.links.forEach(([x, y]) => { adj[x].push(y); adj[y].push(x) })
  const prev = { [src]: null }
  const q = [src]
  while (q.length) {
    const cur = q.shift()
    if (cur === dst) break
    for (const nb of adj[cur]) if (!(nb in prev)) { prev[nb] = cur; q.push(nb) }
  }
  if (!(dst in prev)) return []
  const path = []
  for (let c = dst; c !== null; c = prev[c]) path.unshift(c)
  return path
}

export const internetTarget = (v) => (v === 4 ? '8.8.8.8' : '2001:4860:4860::8888')
const maskTxt = (v, p) => (v === 4 ? fmtV4(((1n << 32n) - 1n) ^ ((1n << BigInt(32 - p)) - 1n)) : `/${p}`)

export function explainPath(topo, path, ttlStart = 64) {
  if (path.length < 2) return []
  const v = topo.version
  const ttlName = v === 4 ? 'TTL' : 'Hop Limit'
  const resolver = v === 4 ? 'ARP' : 'NDP'
  const src = topo.nodes[path[0]]
  const dst = topo.nodes[path[path.length - 1]]
  const dstIp = dst.kind === 'pc' ? dst.ip : internetTarget(v)
  const srcNet = topo.subnets[src.subnet].cidr
  const same = dst.kind === 'pc' && dst.subnet === src.subnet
  const ifaceOf = {}
  topo.ifaces.forEach((i) => (ifaceOf[i.neighbor] = i))
  let ttl = ttlStart
  return path.map((id, idx) => {
    const n = topo.nodes[id]
    const prevId = idx ? path[idx - 1] : null
    const nextId = idx + 1 < path.length ? path[idx + 1] : null
    let title, detail
    if (idx === 0) {
      if (same) {
        title = 'Source host: destination is on the SAME network'
        detail = `${src.ip} and ${dstIp} both fall in ${srcNet}. No router is needed — the host uses ${resolver} to find ${dstIp}'s MAC address and sends the frame directly. Packet: ${src.ip} → ${dstIp}, ${ttlName} ${ttl}.`
      } else {
        const cmp = dst.kind === 'pc'
          ? `${dstIp} belongs to ${topo.subnets[dst.subnet].cidr}, a different network`
          : `${dstIp} is outside every local subnet`
        title = 'Source host: destination is on a DIFFERENT network'
        detail = `${src.ip} AND mask ${maskTxt(v, src.prefix)} = ${srcNet}; ${cmp}. The host sends the packet to its default gateway ${src.gateway} (R1); ${resolver} resolves the gateway's MAC. Packet: ${src.ip} → ${dstIp}, ${ttlName} ${ttl}.`
      }
    } else if (n.kind === 'switch') {
      title = `${n.label}: Layer-2 forwarding`
      detail = `The switch looks up the destination MAC in its MAC table and forwards the frame out of the matching port. Switches don't read IP headers, so the ${ttlName} stays ${ttl}.`
    } else if (n.kind === 'router') {
      const inIf = ifaceOf[prevId].iface
      const outIf = ifaceOf[nextId].iface
      ttl -= 1
      const def = topo.routes[topo.routes.length - 1]
      const route = dst.kind === 'internet'
        ? `default route ${def.dest} via ${def.next}`
        : `connected route ${topo.subnets[dst.subnet].cidr} (${outIf})`
      title = 'R1: routing decision'
      detail = `Packet arrives on ${inIf}. The router strips the Layer-2 header, reads destination ${dstIp} and does a longest-prefix-match lookup → ${route}. It decrements the ${ttlName} (${ttl + 1} → ${ttl}), builds a new frame (using ${resolver} for the next hop) and sends it out of ${outIf}.`
    } else if (n.kind === 'internet') {
      title = 'Internet: packet leaves the local network'
      detail = `The ISP receives the packet on the WAN link and keeps routing it hop by hop towards ${dstIp}. ${ttlName} on arrival: ${ttl}.`
    } else {
      title = `${n.label}: packet delivered`
      detail = `Destination MAC and IP (${dst.ip}) match, so the host accepts the packet and passes it up the stack (e.g. an ICMP echo request). ${ttlName} on arrival: ${ttl}.`
    }
    return { node: id, title, detail, ttl }
  })
}
