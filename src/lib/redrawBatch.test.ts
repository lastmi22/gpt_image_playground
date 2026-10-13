import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { DEFAULT_SETTINGS } from './apiProfiles'
import { createRedrawSnapshot, getRedrawFileBase, getRedrawInputImages, runRedrawQueue } from './redrawBatch'

afterEach(() => vi.useRealTimers())

describe('redraw batch', () => {
  it('keeps queued settings and params independent of later edits', () => {
    const value = {
      prompt: '  固定重绘  ',
      references: [] as File[],
      items: [{ id: 'source', name: 'source.png', file: {} as File }],
      settings: structuredClone(DEFAULT_SETTINGS),
      params: { ...DEFAULT_PARAMS },
      concurrency: 30,
      intervalSeconds: -5,
    }
    const snapshot = createRedrawSnapshot(value)
    value.settings.profiles[0].model = 'changed'
    value.params.n = 7
    value.items[0].name = 'changed.png'
    expect(snapshot.settings.profiles[0].model).toBe(DEFAULT_SETTINGS.profiles[0].model)
    expect(snapshot.params.n).toBe(DEFAULT_PARAMS.n)
    expect(snapshot.items[0].name).toBe('source.png')
    expect(snapshot).toMatchObject({ prompt: '固定重绘', concurrency: 10, intervalSeconds: 0 })
  })

  it('limits active workers while spacing all starts on the same clock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const starts: number[] = []
    let active = 0
    let peak = 0
    const queue = runRedrawQueue([0, 1, 2, 3], 2, 100, async () => {
      starts.push(Date.now())
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 350))
      active--
    }, new AbortController().signal)
    await vi.runAllTimersAsync()
    await queue
    expect(starts).toEqual([0, 100, 350, 450])
    expect(peak).toBe(2)
    expect(active).toBe(0)
  })

  it('stops waiting launches and lets submitted work finish', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const controller = new AbortController()
    const started: number[] = []
    const finished: number[] = []
    const queue = runRedrawQueue([0, 1, 2], 3, 5000, async (item) => {
      started.push(item)
      await new Promise((resolve) => setTimeout(resolve, 200))
      finished.push(item)
    }, controller.signal)
    await vi.advanceTimersByTimeAsync(50)
    controller.abort()
    await vi.runAllTimersAsync()
    await queue
    expect(started).toEqual([0])
    expect(finished).toEqual([0])
    expect(Date.now()).toBe(200)
  })

  it('places the source first and deduplicates fixed references', () => {
    const source = { id: 'source', dataUrl: 'source' }
    const ref = { id: 'style', dataUrl: 'style' }
    expect(getRedrawInputImages(source, [ref, source, ref])).toEqual([source, ref])
    expect(getRedrawFileBase('目录/源图.png', 'task-a')).toContain('源图-task-a')
  })
})
