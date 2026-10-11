import { Component } from 'react'

/** Keeps the page alive if WebGL / a 3D scene throws. */
export class Boundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { console.warn('3D scene disabled:', err) }
  render() { return this.state.failed ? this.props.fallback ?? null : this.props.children }
}
