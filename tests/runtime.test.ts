// @vitest-environment jsdom
// Moteur injecté (pilote runtime) : exécution des étapes, événements, tenue
// sur la durée audio, erreurs strictes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeEngine, type RuntimeConfig } from '../src/runtime/engine'
import type { BaseStep, DemoEvent, DemoRunResult } from '../src/types'

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = `
    <button data-demo-id="menu">Menu</button>
    <input data-demo-id="recherche">
    <ul data-demo-id="liste"><li data-demo-id="objet-1">Un</li></ul>
    <div data-demo-id="cache" style="visibility:hidden">Caché</div>`
  HTMLElement.prototype.scrollIntoView = function () {}
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 10, top: 20, width: 100, height: 30, right: 110, bottom: 50, x: 10, y: 20, toJSON() {} }) as DOMRect)
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 16)) as unknown as typeof requestAnimationFrame
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; document.head.innerHTML = '' })

function run(steps: BaseStep[], options: RuntimeConfig['options'] = {}) {
  const events: DemoEvent[] = []
  let result: DemoRunResult | null = null
  const cfg: RuntimeConfig = {
    scenario: { name: 't', label: 'T', steps }, options: { syncMark: false, stepTimeoutMs: 1000, breathMs: 100, ...options },
    targetAttribute: 'data-demo-id', accent: '#7cc4ff', accentInk: '#000', startDelayMs: 0,
  }
  const eng = new RuntimeEngine(cfg, (e) => events.push(e), (r) => { result = r })
  eng.start()
  return { eng, events, get result() { return result } }
}

describe('moteur injecté', () => {
  it('joue clic, saisie, surbrillance, narration et émet des événements ordonnés', async () => {
    const clicks: string[] = []
    document.querySelector('[data-demo-id="objet-1"]')!.addEventListener('click', () => clicks.push('objet-1'))
    const inputs: string[] = []
    document.querySelector('[data-demo-id="recherche"]')!.addEventListener('input', (e) => inputs.push((e.target as HTMLInputElement).value))
    const c = run([
      { type: 'highlight', target: 'liste', label: 'Liste', narrate: 'La liste.' },
      { type: 'type', target: 'recherche', text: 'M4', narrate: 'On cherche.' },
      { type: 'click', target: 'objet-1', narrate: 'On ouvre.' },
      { type: 'narrate', text: 'Fin.' },
    ])
    await vi.advanceTimersByTimeAsync(30000)
    expect(c.result).toEqual({ ok: true })
    expect(clicks).toEqual(['objet-1'])
    expect(inputs).toEqual(['M', 'M4'])
    const types = c.events.map((e) => e.type)
    expect(types[0]).toBe('scenario:start')
    expect(types.at(-1)).toBe('scenario:end')
    for (const t of ['step:start', 'step:end', 'cursor:move', 'action:click', 'action:type', 'highlight:show', 'narration:show']) expect(types).toContain(t)
    expect(types.filter((t) => t === 'step:end')).toHaveLength(4)
    for (let k = 1; k < c.events.length; k++) expect(c.events[k].t).toBeGreaterThanOrEqual(c.events[k - 1].t)
    expect(document.querySelector('.vs-cursor')).not.toBeNull()
  })

  it('tient chaque étape au moins holdMs à partir de la narration', async () => {
    const c = run([{ type: 'narrate', text: 'Une.' }, { type: 'highlight', target: 'menu', narrate: 'Deux.' }], { holdMs: { 0: 3000, 1: 2500 } })
    await vi.advanceTimersByTimeAsync(20000)
    const show = c.events.filter((e) => e.type === 'narration:show')
    const end = c.events.filter((e) => e.type === 'step:end')
    expect(end[0].t - show[0].t).toBeGreaterThanOrEqual(3000)
    expect(end[0].t - show[0].t).toBeLessThan(3100)
    expect(end[1].t - show[1].t).toBeGreaterThanOrEqual(2500)
  })

  it('élément introuvable ou invisible : action:error, arrêt, overlay retiré', async () => {
    const c = run([{ type: 'click', target: 'cache' }, { type: 'click', target: 'menu' }])
    await vi.advanceTimersByTimeAsync(10000)
    expect(c.result?.ok).toBe(false)
    expect(c.result?.error).toMatch(/introuvable/)
    expect(c.events.find((e) => e.type === 'action:error')?.step).toBe(0)
    expect(c.events.some((e) => e.type === 'scenario:end')).toBe(false)
    expect(document.querySelector('.vs-cursor')).toBeNull()
  })

  it('type d’étape inconnu : erreur explicite', async () => {
    const c = run([{ type: 'danser' }])
    await vi.advanceTimersByTimeAsync(2000)
    expect(c.result?.error).toMatch(/inconnu/)
  })

  it('navigation par URL : pushState + popstate, puis attente de stabilité', async () => {
    const pops: string[] = []
    window.addEventListener('popstate', () => pops.push(location.pathname))
    const c = run([{ type: 'navigate', url: '/carnet', narrate: 'Le carnet.' }])
    await vi.advanceTimersByTimeAsync(5000)
    expect(pops).toEqual(['/carnet'])
    expect(c.events.map((e) => e.type)).toContain('navigation:complete')
    expect(c.result).toEqual({ ok: true })
  })

  it('mire de synchronisation avant scenario:start', async () => {
    const c = run([{ type: 'wait', ms: 100 }], { syncMark: true })
    await vi.advanceTimersByTimeAsync(50)
    expect([...document.body.children].some((n) => (n as HTMLElement).style.background.includes('255, 0, 255') || (n as HTMLElement).style.background === '#ff00ff')).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    const t = c.events.map((e) => e.type)
    expect(t.indexOf('sync:mark')).toBeLessThan(t.indexOf('scenario:start'))
  })

  it('saisie dans un conteneur qui contient le champ (TextField Flutter)', async () => {
    document.body.insertAdjacentHTML('beforeend', '<flt-semantics data-demo-id="champ"><input></flt-semantics>')
    const inputs: string[] = []
    document.querySelector('[data-demo-id="champ"] input')!.addEventListener('input', (e) => inputs.push((e.target as HTMLInputElement).value))
    const c = run([{ type: 'type', target: 'champ', text: 'pain' }])
    await vi.advanceTimersByTimeAsync(10000)
    expect(c.result).toEqual({ ok: true })
    expect(inputs.at(-1)).toBe('pain')
    expect(document.activeElement).toBe(document.querySelector('[data-demo-id="champ"] input'))
  })

  it('conteneur sans champ : erreur « non saisissable »', async () => {
    const c = run([{ type: 'type', target: 'liste', text: 'x' }])
    await vi.advanceTimersByTimeAsync(10000)
    expect(c.result?.error).toMatch(/non saisissable/)
  })

  it('clic sur un conteneur non cliquable : l’action passe à l’élément actionnable qui le recouvre', async () => {
    document.body.insertAdjacentHTML('beforeend', '<flt-semantics data-demo-id="carte"><flt-semantics flt-tappable role="group">Carte</flt-semantics></flt-semantics>')
    const hits: string[] = []
    const inner = document.querySelector('[data-demo-id="carte"] [flt-tappable]')!
    inner.addEventListener('click', (e) => hits.push(e.target === inner ? 'interne' : 'autre'))
    const c = run([{ type: 'click', target: 'carte' }])
    await vi.advanceTimersByTimeAsync(10000)
    expect(c.result).toEqual({ ok: true })
    expect(hits).toEqual(['interne'])
  })

  it('petit bouton dans une carte : le clic reste sur la carte', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div data-demo-id="fiche"><button>Supprimer</button></div>')
    const btn = document.querySelector('[data-demo-id="fiche"] button')!
    const fiche = document.querySelector('[data-demo-id="fiche"]')!
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const r = this === btn ? { left: 10, top: 20, width: 20, height: 10 } : { left: 10, top: 20, width: 100, height: 30 }
      return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} } as DOMRect
    })
    const targets: Element[] = []
    fiche.addEventListener('click', (e) => targets.push(e.target as Element))
    const c = run([{ type: 'click', target: 'fiche' }])
    await vi.advanceTimersByTimeAsync(10000)
    expect(c.result).toEqual({ ok: true })
    expect(targets).toEqual([fiche])
  })

  it('navigation par cible sans aucun effet : erreur au lieu d’une vidéo fausse', async () => {
    const c = run([{ type: 'navigate', target: 'menu', narrate: 'Menu.' }])
    await vi.advanceTimersByTimeAsync(15000)
    expect(c.result?.ok).toBe(false)
    expect(c.result?.error).toMatch(/n'a rien changé/)
  })

  it('navigation par cible qui modifie la page : OK', async () => {
    document.querySelector('[data-demo-id="menu"]')!.addEventListener('click', () => setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<main>Écran 2</main>'), 50))
    const c = run([{ type: 'navigate', target: 'menu', narrate: 'Menu.' }])
    await vi.advanceTimersByTimeAsync(15000)
    expect(c.result).toEqual({ ok: true })
  })

  it('surbrillance masquée : réapparaît sur sa cible sans glisser depuis l’ancienne position', async () => {
    const transitions: string[] = []
    const c = run([
      { type: 'highlight', target: 'liste' },
      { type: 'navigate', url: '/ailleurs' },
      { type: 'highlight', target: 'menu' },
    ])
    const hl = () => document.querySelector<HTMLElement>('.vs-highlight')!
    await vi.advanceTimersByTimeAsync(1)
    const style = hl().style
    const orig = style.setProperty.bind(style)
    Object.defineProperty(style, 'transition', { configurable: true, get: () => style.getPropertyValue('transition'), set: (v: string) => { transitions.push(v); orig('transition', v) } })
    await vi.advanceTimersByTimeAsync(15000)
    expect(c.result).toEqual({ ok: true })
    expect(transitions).toContain('none')
  })
})
