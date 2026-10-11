import { lazy, Suspense, useEffect, useState } from 'react'
import { useInView, webglAvailable } from '../lib/env'
import { Boundary } from './Boundary'

const HeroCanvas = lazy(() => import('../three/HeroCanvas'))

export function Nav() {
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={`nav${solid ? ' solid' : ''}`}>
      <a href="#top" className="brand"><i className="logo" />CCNS<span>·Net</span></a>
      <nav>
        <a href="#overview">Overview</a>
        <a href="#how">How it works</a>
        <a href="#stack">Stack</a>
        <a href="#get">Get the code</a>
        <a href="#team">Team</a>
      </nav>
      <a href="#demo" className="btn primary sm">Live demo</a>
    </header>
  )
}

export function Hero() {
  const [ref, visible] = useInView('0px')
  const [gl, setGl] = useState(false)
  useEffect(() => { setGl(webglAvailable()) }, [])
  return (
    <section id="top" className="hero" ref={ref}>
      <div className="hero-canvas" aria-hidden="true">
        {gl && (
          <Boundary>
            <Suspense fallback={null}>
              <HeroCanvas visible={visible} />
            </Suspense>
          </Boundary>
        )}
      </div>
      <div className="container hero-inner">
        <p className="eyebrow">21ECC402P · Computer Communication &amp; Network Security</p>
        <h1>See how every packet<br /><span className="grad">finds its way home.</span></h1>
        <p className="lead">
          An interactive <b>IPv4 &amp; IPv6</b> addressing, subnetting and network visualization simulator.
          Calculate the subnets, build the topology, then watch a packet route across it — in 3D.
        </p>
        <div className="cta">
          <a href="#demo" className="btn primary">Launch live demo</a>
          <a href="#get" className="btn ghost">Get the project</a>
        </div>
        <ul className="chips">
          {['Python', 'Streamlit', 'ipaddress', 'CIDR', 'Subnetting', 'Routing'].map((c) => <li key={c}>{c}</li>)}
        </ul>
      </div>
      <a href="#overview" className="scroll-hint" aria-label="Scroll down"><span /></a>
    </section>
  )
}

const OBJECTIVES = [
  'Interactive Python simulator for IPv4 and IPv6 addressing and subnetting',
  'Accurate CIDR subnetting — network address, prefix, host range, address counts',
  'Binary-level, step-by-step visualization of addressing and subnetting',
  'Graphical network architecture with routers, switches and end devices',
  'Automatic IP assignment to devices from the calculated subnets',
  'Device-to-device routing paths and packet flow through the topology',
  'Streamlit web interface for learning and analysing IP, subnets, topology and routing',
]

export function Overview() {
  return (
    <section id="overview" className="section container">
      <div className="head reveal">
        <p className="eyebrow">Overview</p>
        <h2>Calculators give you numbers.<br /><span className="grad">This shows you the network.</span></h2>
      </div>
      <div className="grid3">
        <article className="card glass reveal">
          <h3>The problem</h3>
          <p>Manual subnetting is slow and error-prone, and basic IP calculators only print results. They never show how those addresses sit inside a real network of routers, switches and devices — or the path a packet follows between them.</p>
        </article>
        <article className="card glass reveal">
          <h3>The solution</h3>
          <p>A Python and Streamlit simulator that validates IPv4/IPv6 input, performs CIDR subnetting with binary and step-by-step views, generates a pictographic topology with auto-assigned IPs, and animates routing between any two devices.</p>
        </article>
        <article className="card glass reveal">
          <h3>The outcome</h3>
          <p>Learners see exactly how network and host bits split, how subnets connect through a gateway, and how TTL changes hop by hop — turning abstract addressing concepts into something visual and interactive.</p>
        </article>
      </div>
      <h3 className="sub reveal">Objectives</h3>
      <ol className="objectives">
        {OBJECTIVES.map((o, i) => (
          <li key={o} className="reveal"><span>{String(i + 1).padStart(2, '0')}</span>{o}</li>
        ))}
      </ol>
    </section>
  )
}

export function DemoIntro() {
  return (
    <div className="head reveal">
      <p className="eyebrow">Live demo</p>
      <h2>Try the simulator <span className="grad">right here.</span></h2>
      <p className="lead sm">The same addressing, subnetting and routing logic as the Python app, running in your browser. Change the network and the 3D topology rebuilds instantly.</p>
    </div>
  )
}

const SECTIONS = [
  ['01', 'IP Address Input', 'Choose IPv4 or IPv6, enter an address and CIDR prefix, then set the number of subnets and devices.'],
  ['02', 'Addressing & Subnetting', 'Network address, prefix, subnet mask, host range, address counts, binary representation and the full calculation.'],
  ['03', 'Graphical Network Topology', 'Internet → Router → Switches → End devices, with IPs and gateways assigned from each subnet.'],
  ['04', 'Routing Simulation', 'Pick a source and destination, visualize the route, animate the packet and read the routing information.'],
]
const PIPELINE = ['Input', 'Validate', 'Process', 'Subnet', 'Configure', 'Topology', 'Route', 'Display']

export function How() {
  return (
    <section id="how" className="section container">
      <div className="head reveal">
        <p className="eyebrow">How it works</p>
        <h2>One app. <span className="grad">Four sections.</span></h2>
      </div>
      <div className="grid4">
        {SECTIONS.map(([n, t, d]) => (
          <article key={n} className="card glass step reveal">
            <span className="num">{n}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </article>
        ))}
      </div>
      <div className="pipeline reveal" aria-label="Methodology">
        {PIPELINE.map((p, i) => (
          <div key={p} className="pipe"><b>{i + 1}</b>{p}</div>
        ))}
      </div>
    </section>
  )
}

const TOOLS = [
  ['Python', 'Main language for the IP addressing and subnetting logic.'],
  ['Streamlit', 'Interactive web interface for the simulator.'],
  ['ipaddress library', 'IPv4/IPv6 validation, CIDR processing, network calculations and subnet generation.'],
  ['Visual Studio Code', 'Development environment for writing, testing and debugging.'],
  ['Web browser', 'Runs and interacts with the Streamlit app.'],
]
const CONCEPTS = ['IPv4 Addressing', 'IPv6 Addressing', 'CIDR & Prefix Length', 'Subnetting', 'Network & Host Addressing', 'Network Topology', 'Routing', 'Packet Flow']

export function Stack() {
  return (
    <section id="stack" className="section container">
      <div className="head reveal">
        <p className="eyebrow">Tools &amp; concepts</p>
        <h2>Built with <span className="grad">the basics, done right.</span></h2>
      </div>
      <div className="grid-tools">
        {TOOLS.map(([t, d]) => (
          <article key={t} className="card glass reveal"><h3>{t}</h3><p>{d}</p></article>
        ))}
      </div>
      <h3 className="sub reveal">Relevant CCNS concepts</h3>
      <ul className="chips big reveal">{CONCEPTS.map((c) => <li key={c}>{c}</li>)}</ul>
      <p className="muted center reveal">
        This website: React · Vite · three.js · @react-three/fiber · drei · postprocessing — the live demo is a JavaScript port of the Python engine.
      </p>
    </section>
  )
}

const FILES = [
  ['app.py', 'Streamlit interface — Sections 1 to 4'],
  ['netcore.py', 'Validation, subnetting, topology, routing logic'],
  ['requirements.txt', 'streamlit>=1.30'],
  ['README.md', 'Run instructions'],
]
const CMDS = ['pip install -r requirements.txt', 'streamlit run app.py']

function Copy({ text }) {
  const [ok, setOk] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setOk(true)
      setTimeout(() => setOk(false), 1400)
    } catch { /* clipboard unavailable */ }
  }
  return <button className="copy" onClick={copy} aria-label={`Copy ${text}`}>{ok ? 'Copied ✓' : 'Copy'}</button>
}

export function GetIt() {
  return (
    <section id="get" className="section container">
      <div className="head reveal">
        <p className="eyebrow">Get the project</p>
        <h2>Run the full <span className="grad">Streamlit app.</span></h2>
        <p className="lead sm">Download the four files into one folder and run two commands.</p>
      </div>
      <div className="get-grid">
        <div className="files">
          {FILES.map(([f, d]) => (
            <a key={f} className="file glass reveal" href={`/project/${f}`} download>
              <b>{f}</b><span>{d}</span><i>↓</i>
            </a>
          ))}
        </div>
        <div className="terminal glass reveal">
          <div className="term-bar"><i /><i /><i /><span>terminal</span></div>
          {CMDS.map((c) => (
            <div className="cmd" key={c}><code><em>$</em> {c}</code><Copy text={c} /></div>
          ))}
          <p className="muted">Opens at http://localhost:8501</p>
        </div>
      </div>
    </section>
  )
}

const TEAM = [
  ['Aravind Sai K', 'RA2311053010035', 'AS'],
  ['Sainath Reddy E', 'RA2311053010038', 'SR'],
  ['Surya Teja D', 'RA2311053010040', 'ST'],
]

export function Team() {
  return (
    <section id="team" className="section container">
      <div className="head reveal">
        <p className="eyebrow">Team</p>
        <h2>The people <span className="grad">behind it.</span></h2>
      </div>
      <div className="grid3">
        {TEAM.map(([n, r, i]) => (
          <article key={r} className="card glass person reveal">
            <div className="avatar">{i}</div>
            <h3>{n}</h3>
            <code>{r}</code>
          </article>
        ))}
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <b>IPv4 &amp; IPv6 Addressing, Subnetting and Network Visualization Simulator</b>
        <span>21ECC402P – Computer Communication and Network Security (CCNS)</span>
      </div>
    </footer>
  )
}
