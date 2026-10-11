import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyze, bitRows, buildTopology, explainPath, findPath, internetTarget, parseInput, splitSubnets } from '../lib/net'
import { useInView, webglAvailable } from '../lib/env'
import { Boundary } from './Boundary'

const DemoCanvas = lazy(() => import('../three/DemoCanvas'))

const PRESETS = [
  { name: '192.168.1.0/24 · 4 subnets', version: 'IPv4', ip: '192.168.1.10', prefix: '24', n: 4 },
  { name: '10.0.0.0/16 · 8 subnets', version: 'IPv4', ip: '10.0.5.9', prefix: '16', n: 8 },
  { name: '172.16.0.0/22 · 2 subnets', version: 'IPv4', ip: '172.16.1.20', prefix: '22', n: 2 },
  { name: '2001:db8:abcd::/48 · 4 subnets', version: 'IPv6', ip: '2001:db8:abcd::10', prefix: '48', n: 4 },
]

const Segs = ({ segs }) => segs.map((s, i) => <span key={i} className={`b-${s.cls}`}>{s.text}</span>)

function BitLine({ label, rows }) {
  return (
    <div className="bitline">
      {label && <div className="bl-label">{label}</div>}
      {rows.map((r, i) => (
        <div className="bl-row" key={i}>
          {r.label && <span className="bl-hex">{r.label}</span>}
          <code><Segs segs={r.segs} /></code>
        </div>
      ))}
    </div>
  )
}

const Fact = ({ k, v, wide }) => (
  <div className={`fact${wide ? ' wide' : ''}`}><span>{k}</span><b>{v}</b></div>
)

export default function LiveDemo() {
  const [version, setVersion] = useState('IPv4')
  const [ip, setIp] = useState('192.168.1.10')
  const [prefix, setPrefix] = useState('24')
  const [nSub, setNSub] = useState(4)
  const [devices, setDevices] = useState(2)
  const [src, setSrc] = useState('PC1')
  const [dst, setDst] = useState('PC7')
  const [runId, setRunId] = useState(0)
  const [step, setStep] = useState(0)
  const [tab, setTab] = useState('route')
  const [gl, setGl] = useState(true)
  const [canvasRef, visible] = useInView('160px')

  useEffect(() => { setGl(webglAvailable()) }, [])

  const model = useMemo(() => {
    try {
      const a = parseInput(version, ip, prefix)
      return { an: analyze(a), topo: buildTopology(a, nSub, devices) }
    } catch (e) {
      return { error: e.message }
    }
  }, [version, ip, prefix, nSub, devices])

  // keep showing the last valid network while the user is mid-typing
  const lastGood = useRef(null)
  if (model.topo) lastGood.current = model
  const shown = lastGood.current
  const stale = !!model.error
  const { an, topo } = shown

  const pcs = useMemo(() => Object.values(topo.nodes).filter((n) => n.kind === 'pc').map((n) => n.id), [topo])
  const srcId = pcs.includes(src) ? src : pcs[0]
  const dstOpts = useMemo(() => [...pcs.filter((p) => p !== srcId), 'INET'], [pcs, srcId])
  const dstId = dstOpts.includes(dst) ? dst : dstOpts[Math.max(0, dstOpts.length - 2)]
  const path = useMemo(() => findPath(topo, srcId, dstId), [topo, srcId, dstId])
  const steps = useMemo(() => explainPath(topo, path), [topo, path])
  const sub = useMemo(() => splitSubnets(an, nSub, 8), [an, nSub])
  const subPrefix = nSub > 1 ? sub.prefix : null

  useEffect(() => { setStep(0) }, [path])
  const onStep = useCallback((i) => setStep(i), [])
  const cur = steps[Math.min(step, steps.length - 1)]
  const ttlName = topo.version === 4 ? 'TTL' : 'Hop Limit'
  const label = (id) => (id === 'INET' ? `Internet (${internetTarget(topo.version)})` : `${id} · ${topo.nodes[id].ip}`)

  const applyPreset = (p) => {
    setVersion(p.version); setIp(p.ip); setPrefix(p.prefix); setNSub(p.n)
    setSrc('PC1'); setDst('INET')
  }
  const switchVersion = (v) => {
    setVersion(v)
    setIp(v === 'IPv4' ? '192.168.1.10' : '2001:db8:abcd::10')
    setPrefix(v === 'IPv4' ? '24' : '48')
  }

  return (
    <div className="demo">
      <div className="demo-panel glass">
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.name} className="chip-btn" onClick={() => applyPreset(p)}>{p.name}</button>
          ))}
        </div>

        <div className="form">
          <div className="seg" role="radiogroup" aria-label="IP version">
            {['IPv4', 'IPv6'].map((v) => (
              <button key={v} role="radio" aria-checked={version === v} className={version === v ? 'on' : ''}
                onClick={() => switchVersion(v)}>{v}</button>
            ))}
          </div>
          <label className="field grow">
            <span>IP address</span>
            <input value={ip} onChange={(e) => setIp(e.target.value)} spellCheck="false" autoComplete="off" />
          </label>
          <label className="field sm">
            <span>CIDR /n</span>
            <input value={prefix} inputMode="numeric" onChange={(e) => setPrefix(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <label className="field sm">
            <span>Subnets</span>
            <select value={nSub} onChange={(e) => setNSub(Number(e.target.value))}>
              {[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="field sm">
            <span>Devices / subnet</span>
            <select value={devices} onChange={(e) => setDevices(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        {model.error && <div className="alert err" role="alert">⚠ {model.error}</div>}
        {topo.notes.map((n) => <div className="alert warn" key={n}>{n}</div>)}

        <div className="tabs" role="tablist">
          {[['route', 'Routing'], ['calc', 'Addressing'], ['bits', 'Binary'], ['subnets', 'Subnets']].map(([k, t]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>
          ))}
        </div>

        <div className={`tab-body${stale ? ' stale' : ''}`}>
          {tab === 'route' && (
            <ol className="timeline">
              {steps.map((s, i) => (
                <li key={`${s.node}-${i}`} className={i === step ? 'active' : i < step ? 'done' : ''}>
                  <span className="dot" />
                  <div>
                    <b>{s.title}</b>
                    <p>{s.detail}</p>
                  </div>
                  <em>{ttlName} {s.ttl}</em>
                </li>
              ))}
            </ol>
          )}

          {tab === 'calc' && (
            <div className="facts">
              <Fact k="Network" v={`${an.str.network}/${an.prefix}`} />
              <Fact k={an.version === 4 ? 'Subnet mask' : 'Prefix mask'} v={an.str.mask} />
              {an.version === 4 ? <Fact k="Broadcast" v={an.str.broadcast} /> : <Fact k="Last address" v={an.str.last} wide />}
              {an.version === 4 && <Fact k="Wildcard" v={an.str.wildcard} />}
              <Fact k="First usable" v={an.str.first} />
              <Fact k="Last usable" v={an.str.lastUsable} />
              <Fact k="Total addresses" v={an.str.total} wide />
              <Fact k="Usable hosts" v={an.str.usable} wide />
              <Fact k="Address type" v={an.type} wide />
              {an.version === 4 && <Fact k="Class" v={an.klass} />}
              <Fact k="Host bits" v={`${an.hostBits} of ${an.bits}`} />
            </div>
          )}

          {tab === 'bits' && (
            <div>
              <div className="legend">
                <span><i className="sw net" /> network</span>
                {subPrefix !== null && <span><i className="sw sub" /> borrowed subnet bits</span>}
                <span><i className="sw host" /> host</span>
              </div>
              <BitLine label="IP address" rows={bitRows(an.version, an.addr, an.prefix, subPrefix)} />
              {an.version === 4 && (
                <>
                  <BitLine label="Subnet mask" rows={bitRows(4, an.mask, an.prefix, subPrefix)} />
                  <BitLine label="Network address (IP AND mask)" rows={bitRows(4, an.network, an.prefix, subPrefix)} />
                </>
              )}
            </div>
          )}

          {tab === 'subnets' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Subnet</th><th>Usable range</th><th>Hosts</th></tr></thead>
                <tbody>
                  {sub.rows.map((r) => (
                    <tr key={r.i} className={r.hasIp ? 'hit' : ''}>
                      <td>{r.i}</td>
                      <td><code>{r.cidr}</code></td>
                      <td><code>{r.first} – {r.last}</code></td>
                      <td>{r.usable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {nSub > 8 && <p className="muted">Showing the first 8 subnets.</p>}
              <p className="muted">Highlighted row = the subnet that contains {an.str.ip}.</p>
            </div>
          )}
        </div>
      </div>

      <div className="demo-stage glass" ref={canvasRef}>
        <div className="stage-top">
          <label className="field mini">
            <span>Source</span>
            <select value={srcId} onChange={(e) => setSrc(e.target.value)}>
              {pcs.map((p) => <option key={p} value={p}>{label(p)}</option>)}
            </select>
          </label>
          <span className="arrow">→</span>
          <label className="field mini">
            <span>Destination</span>
            <select value={dstId} onChange={(e) => setDst(e.target.value)}>
              {dstOpts.map((p) => <option key={p} value={p}>{label(p)}</option>)}
            </select>
          </label>
          <button className="btn primary sm" onClick={() => { setStep(0); setRunId((r) => r + 1) }}>▶ Send packet</button>
        </div>

        <div className="stage-canvas">
          {gl ? (
            <Boundary fallback={<div className="no-gl">The 3D view couldn't start on this device. The calculations still work.</div>}>
              <Suspense fallback={<div className="no-gl">Loading 3D scene…</div>}>
                <DemoCanvas topo={topo} path={path} step={step} runId={runId} onStep={onStep} visible={visible} />
              </Suspense>
            </Boundary>
          ) : (
            <div className="no-gl">WebGL isn't available in this browser, so the 3D view is disabled. The calculations still work.</div>
          )}
        </div>

        {cur && (
          <div className="stage-cap" aria-live="polite">
            <div className="cap-head">
              <span className="badge">Step {Math.min(step, steps.length - 1) + 1}/{steps.length}</span>
              <b>{cur.title}</b>
              <em>{ttlName} = {cur.ttl}</em>
            </div>
            <p>{cur.detail}</p>
          </div>
        )}
        <p className="hint">Drag to orbit · pick any source and destination · the packet follows the real routing path</p>
      </div>
    </div>
  )
}
