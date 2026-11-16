// Moteur de capture injecté dans la page (pilote « runtime »).
//
// Pour les applications SANS moteur de démo : video-studio injecte ce script
// avant le chargement ; il joue les étapes RuntimeStep dans l'interface réelle
// (vrais clics, vraie saisie), dessine un curseur virtuel et une surbrillance,
// et émet les événements du protocole de capture. DOM pur, aucune dépendance.
//
// Contrat avec l'enregistreur (globales window) :
//   __VIDEO_RUNTIME__        { scenario, options, targetAttribute, loadingSelector, accent, startDelayMs }
//   __VIDEO_CAPTURE_EVENTS__ DemoEvent[]  (rempli au fil de l'eau)
//   __VIDEO_CAPTURE_RESULT__ { ok, error?, step? } | null
//   __VIDEO_REAL_CLOCK__     { now(), origin } — horloge réelle (l'horloge de la page peut être simulée)
import type { BaseStep, CaptureRequest, CaptureEventType, DemoEvent, DemoRunResult } from '../types'

export interface RuntimeConfig extends CaptureRequest {
  targetAttribute: string
  loadingSelector?: string
  accent: string
  accentInk: string
  startDelayMs: number
}

type W = Window & {
  __VIDEO_RUNTIME__?: RuntimeConfig
  __VIDEO_CAPTURE_EVENTS__?: DemoEvent[]
  __VIDEO_CAPTURE_RESULT__?: DemoRunResult | null
  __VIDEO_REAL_CLOCK__?: { now: () => number; origin: number }
}

class StepError extends Error {}

const CURSOR = (accent: string, ink: string) =>
  `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 8.5-6 1.4L10.5 19 5 3z" fill="${ink}" stroke="${accent}" stroke-width="1.4" stroke-linejoin="round"/></svg>`

export class RuntimeEngine {
  private i = 0
  private aborted = false
  private finished = false
  private narrAt: number | null = null
  private narrShown = false
  private hlTarget: HTMLElement | null = null
  private cursorX = 0
  private cursorY = 0
  private cursor!: HTMLElement
  private highlight!: HTMLElement
  private hlLabel!: HTMLElement
  private shield!: HTMLElement
  private style!: HTMLStyleElement
  private readonly clock: { now: () => number; origin: number }

  constructor(private readonly cfg: RuntimeConfig, private readonly onEvent: (e: DemoEvent) => void, private readonly onFinish: (r: DemoRunResult) => void) {
    const w = window as W
    this.clock = w.__VIDEO_REAL_CLOCK__ ?? { now: () => performance.now(), origin: performance.timeOrigin }
  }

  private get steps(): BaseStep[] { return this.cfg.scenario.steps }
  private get opts() { return this.cfg.options }

  private emit(type: CaptureEventType, data?: Record<string, unknown>, step: number | undefined = this.i) {
    const t = this.clock.now()
    try { this.onEvent({ type, t, epoch: this.clock.origin + t, step, data }) } catch { /* ignore */ }
  }

  // ── Cycle de vie ──────────────────────────────────────────────────────────
  start(): void {
    this.buildOverlay()
    this.cursorX = window.innerWidth / 2
    this.cursorY = window.innerHeight - 120
    this.placeCursor(0)
    void this.run()
  }

  stop(): void {
    if (this.aborted) return
    this.aborted = true
    for (const n of [this.shield, this.highlight, this.cursor, this.style]) n?.remove()
    document.querySelectorAll('.vs-ripple').forEach((r) => r.remove())
  }

  private async run(): Promise<void> {
    if (this.opts.syncMark !== false) await this.syncMark()
    this.emit('scenario:start', { name: this.cfg.scenario.name, steps: this.steps.length, mode: 'capture' }, undefined)
    while (this.i < this.steps.length && !this.aborted) {
      const step = this.steps[this.i]
      const t0 = this.clock.now()
      this.narrAt = null
      this.emit('step:start', { type: step.type })
      try {
        await this.exec(step)
        const h = this.opts.holdMs?.[this.i]
        if (h) {
          const remain = h - (this.clock.now() - (this.narrAt ?? t0))
          if (remain > 0) await this.sleep(remain)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.emit('action:error', { message, type: step.type })
        this.finished = true
        this.onFinish({ ok: false, error: message, step: this.i })
        this.stop()
        return
      }
      this.emit('step:end', { type: step.type })
      this.i++
      await this.sleep(this.scaled(this.opts.breathMs ?? 650))
    }
    if (this.aborted) return
    if (this.hlTarget) this.emit('highlight:hide')
    if (this.narrShown) this.emit('narration:hide')
    this.finished = true
    this.emit('scenario:end', { ok: true }, undefined)
    this.onFinish({ ok: true })
  }

  private async syncMark(): Promise<void> {
    const mark = document.createElement('div')
    Object.assign(mark.style, { position: 'fixed', inset: '0', zIndex: '2147483647', background: '#ff00ff' })
    document.body.appendChild(mark)
    await new Promise<void>((resolve) => requestAnimationFrame(() => { this.emit('sync:mark', { color: '#ff00ff' }, undefined); resolve() }))
    await this.sleep(500)
    mark.remove()
    await this.sleep(400)
  }

  // ── Étapes ────────────────────────────────────────────────────────────────
  private async exec(step: BaseStep): Promise<void> {
    switch (step.type) {
      case 'navigate': {
        this.clearHighlight()
        if (step.narrate) this.setNarration(step.narrate)
        if (typeof step.url === 'string') {
          history.pushState(null, '', step.url)
          window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
        } else if (step.target) {
          const el = await this.waitForEl(step.target)
          await this.moveCursorTo(el)
          await this.clickEl(el, step.target)
        }
        await this.waitForSettled()
        this.emit('navigation:complete', { url: step.url ?? null, target: step.target ?? null })
        break
      }
      case 'wait':
        await this.sleep(this.scaled(step.ms ?? 0))
        break
      case 'narrate':
        this.setNarration(String(step.text ?? ''), typeof step.title === 'string' ? step.title : undefined)
        if (!this.opts.holdMs?.[this.i]) await this.sleep(this.scaled(typeof step.ms === 'number' ? step.ms : Math.min(6000, Math.max(2200, String(step.text ?? '').length * 48))))
        break
      case 'highlight': case 'scroll': {
        const el = await this.waitForEl(String(step.target))
        if (step.narrate) this.setNarration(step.narrate)
        if (step.type === 'highlight') { await this.moveCursorTo(el); this.showHighlight(el, typeof step.label === 'string' ? step.label : undefined) }
        break
      }
      case 'click': {
        const el = await this.waitForEl(String(step.target))
        if (step.narrate) this.setNarration(step.narrate)
        await this.moveCursorTo(el)
        this.showHighlight(el)
        await this.sleep(this.scaled(260))
        await this.clickEl(el, String(step.target))
        await this.sleep(this.scaled(260))
        break
      }
      case 'type': {
        const el = await this.waitForEl(String(step.target))
        if (step.narrate) this.setNarration(step.narrate)
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable)) {
          throw new StepError(`Élément « ${step.target} » non saisissable`)
        }
        await this.moveCursorTo(el)
        this.showHighlight(el)
        el.focus()
        this.emit('action:type', { target: step.target, text: step.text })
        await this.typeInto(el, String(step.text ?? ''))
        break
      }
      default:
        throw new StepError(`Type d'étape inconnu du moteur injecté : « ${step.type} »`)
    }
  }

  private async clickEl(el: HTMLElement, target: string): Promise<void> {
    this.cursor.classList.add('vs-press')
    setTimeout(() => this.cursor.classList.remove('vs-press'), 240)
    this.ripple(this.cursorX, this.cursorY)
    this.emit('action:click', { target, x: this.cursorX, y: this.cursorY })
    const o = { bubbles: true, cancelable: true, clientX: this.cursorX, clientY: this.cursorY }
    const Ptr = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
    el.dispatchEvent(new Ptr('pointerdown', o))
    el.dispatchEvent(new MouseEvent('mousedown', o))
    el.dispatchEvent(new Ptr('pointerup', o))
    el.dispatchEvent(new MouseEvent('mouseup', o))
    el.click()
  }

  private async typeInto(el: HTMLElement, text: string): Promise<void> {
    if (el.isContentEditable && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      for (const ch of text) { if (this.aborted) return; document.execCommand('insertText', false, ch); await this.sleep(this.scaled(45)) }
      return
    }
    const input = el as HTMLInputElement | HTMLTextAreaElement
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    let acc = ''
    for (const ch of text) {
      if (this.aborted) return
      acc += ch
      if (setter) setter.call(input, acc); else input.value = acc   // compatible React / Vue
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await this.sleep(this.scaled(45))
    }
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // ── Ciblage et attentes ───────────────────────────────────────────────────
  private find(id: string): HTMLElement | null {
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&')
    return document.querySelector<HTMLElement>(`[${this.cfg.targetAttribute}="${esc}"]`)
  }

  private visible(el: HTMLElement): boolean {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
  }

  private async waitForEl(id: string): Promise<HTMLElement> {
    const timeout = this.opts.stepTimeoutMs ?? 10000
    const t0 = this.clock.now()
    while (!this.aborted) {
      const el = this.find(id)
      if (el && this.visible(el)) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        await this.waitStable(id)
        return this.find(id) ?? el
      }
      if (this.clock.now() - t0 > timeout) throw new StepError(`Élément introuvable : [${this.cfg.targetAttribute}="${id}"] (après ${timeout} ms)`)
      await this.sleep(100)
    }
    throw new StepError('Capture interrompue')
  }

  private async waitStable(id: string): Promise<void> {
    let last = ''
    let same = 0
    const t0 = this.clock.now()
    while (!this.aborted && this.clock.now() - t0 < 1500) {
      await this.sleep(60)
      const r = this.find(id)?.getBoundingClientRect()
      const sig = r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}` : ''
      same = sig === last ? same + 1 : 0
      last = sig
      if (same >= 3) return
    }
  }

  /** Après une navigation : plus d'indicateur de chargement et DOM calme pendant 300 ms. */
  private async waitForSettled(): Promise<void> {
    const timeout = this.opts.stepTimeoutMs ?? 10000
    const t0 = this.clock.now()
    let lastMutation = this.clock.now()
    const mo = new MutationObserver(() => { lastMutation = this.clock.now() })
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    try {
      while (!this.aborted) {
        const loading = this.cfg.loadingSelector ? document.querySelector(this.cfg.loadingSelector) : null
        if (!loading && this.clock.now() - lastMutation > 300) break
        if (this.clock.now() - t0 > timeout) throw new StepError(`Navigation non stabilisée (après ${timeout} ms)`)
        await this.sleep(60)
      }
    } finally { mo.disconnect() }
    await this.sleep(this.scaled(350))
  }

  // ── Overlay ───────────────────────────────────────────────────────────────
  private buildOverlay(): void {
    const a = this.cfg.accent
    this.style = document.createElement('style')
    this.style.textContent = `
      .vs-shield{position:fixed;inset:0;z-index:2147483000;background:transparent}
      .vs-highlight{position:fixed;z-index:2147483100;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none;
        border:2px solid ${a};border-radius:12px;box-shadow:0 0 0 4px ${a}29,0 0 22px ${a}59;
        transition:left .45s cubic-bezier(.4,.1,.2,1),top .45s cubic-bezier(.4,.1,.2,1),width .45s cubic-bezier(.4,.1,.2,1),height .45s cubic-bezier(.4,.1,.2,1),opacity .25s ease}
      .vs-label{position:absolute;left:0;top:-27px;display:none;white-space:nowrap;padding:3px 9px;border-radius:8px;
        font:600 11px/1.4 ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:${this.cfg.accentInk};background:${a}}
      .vs-cursor{position:fixed;z-index:2147483300;top:0;left:0;margin:-3px 0 0 -3px;pointer-events:none;transition:transform .56s cubic-bezier(.4,.1,.2,1)}
      .vs-cursor svg{display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.55))}
      .vs-cursor.vs-press svg{animation:vsPress .24s ease}
      @keyframes vsPress{50%{transform:scale(.78)}}
      .vs-ripple{position:fixed;z-index:2147483200;top:0;left:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
        border:2px solid ${a};pointer-events:none;animation:vsRipple .5s ease-out forwards}
      @keyframes vsRipple{from{transform:var(--p) scale(.4);opacity:.8}to{transform:var(--p) scale(1.7);opacity:0}}`
    document.head.appendChild(this.style)
    this.shield = this.el('vs-shield')
    this.highlight = this.el('vs-highlight')
    this.hlLabel = this.el('vs-label')
    this.highlight.appendChild(this.hlLabel)
    this.cursor = this.el('vs-cursor')
    this.cursor.innerHTML = CURSOR(a, this.cfg.accentInk)
    document.body.append(this.shield, this.highlight, this.cursor)
    const reposition = () => this.positionHighlight()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
  }

  private el(cls: string): HTMLElement {
    const n = document.createElement('div')
    n.className = cls
    return n
  }

  private placeCursor(durationMs: number): void {
    this.cursor.style.transitionDuration = `${durationMs}ms`
    this.cursor.style.transform = `translate(${this.cursorX}px, ${this.cursorY}px)`
  }

  private async moveCursorTo(el: HTMLElement): Promise<void> {
    const r = el.getBoundingClientRect()
    const from = { x: this.cursorX, y: this.cursorY }
    this.cursorX = r.left + r.width / 2
    this.cursorY = r.top + r.height / 2
    const d = this.scaled(560)
    this.emit('cursor:move', { from, to: { x: this.cursorX, y: this.cursorY }, durationMs: d })
    this.placeCursor(d)
    await this.sleep(d)
  }

  private ripple(x: number, y: number): void {
    const r = this.el('vs-ripple')
    r.style.setProperty('--p', `translate(${x}px, ${y}px)`)
    document.body.appendChild(r)
    setTimeout(() => r.remove(), 550)
  }

  private showHighlight(el: HTMLElement, label?: string): void {
    this.hlTarget = el
    this.positionHighlight()
    this.highlight.style.opacity = '1'
    this.hlLabel.textContent = label ?? ''
    this.hlLabel.style.display = label ? 'block' : 'none'
    const r = el.getBoundingClientRect()
    this.emit('highlight:show', {
      target: el.getAttribute(this.cfg.targetAttribute), label: label ?? null,
      rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    })
  }

  private positionHighlight(): void {
    if (!this.hlTarget) return
    const r = this.hlTarget.getBoundingClientRect()
    const pad = 6
    Object.assign(this.highlight.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` })
  }

  private clearHighlight(): void {
    if (this.hlTarget) this.emit('highlight:hide')
    this.hlTarget = null
    this.highlight.style.opacity = '0'
  }

  /** La narration n'est pas dessinée dans la page : la composition l'affiche. */
  private setNarration(text: string, title?: string): void {
    if (this.narrShown) this.emit('narration:hide')
    this.narrShown = true
    this.narrAt = this.clock.now()
    this.emit('narration:show', { text, title: title ?? null })
  }

  private scaled(ms: number): number { return Math.round(ms / (this.opts.speed || 1)) }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => (ms <= 0 || this.aborted ? resolve() : setTimeout(resolve, ms)))
  }
}

/** Démarrage automatique quand le script est injecté par l'enregistreur. */
export function autoStart(): void {
  const w = window as W
  const cfg = w.__VIDEO_RUNTIME__
  if (!cfg) return
  w.__VIDEO_CAPTURE_EVENTS__ = []
  w.__VIDEO_CAPTURE_RESULT__ = null
  const go = () => setTimeout(() => {
    const eng = new RuntimeEngine(cfg, (e) => w.__VIDEO_CAPTURE_EVENTS__!.push(e), (r) => { if (!w.__VIDEO_CAPTURE_RESULT__) w.__VIDEO_CAPTURE_RESULT__ = r })
    eng.start()
  }, cfg.startDelayMs)
  if (document.readyState === 'complete') go()
  else window.addEventListener('load', go, { once: true })
}
