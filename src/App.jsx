import LiveDemo from './ui/LiveDemo'
import { DemoIntro, Footer, GetIt, Hero, How, Nav, Overview, Stack, Team } from './ui/Sections'
import { useRevealOnScroll } from './lib/env'

export default function App() {
  useRevealOnScroll()
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Overview />
        <section id="demo" className="section container wide">
          <DemoIntro />
          <LiveDemo />
        </section>
        <How />
        <Stack />
        <GetIt />
        <Team />
      </main>
      <Footer />
    </>
  )
}
