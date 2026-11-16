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
})
