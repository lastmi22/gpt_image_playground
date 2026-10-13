import type { AppSettings, InputImage, TaskParams } from '../types'
import { MAX_INPUT_IMAGES } from '../types'
import { sanitizeFileNamePart } from './exportFileName'

export interface RedrawItem {
  id: string
  name: string
  file: File
}

export interface RedrawSnapshot {
  id: string
  prompt: string
  references: File[]
  items: RedrawItem[]
  settings: AppSettings
  params: TaskParams
  concurrency: number
  intervalSeconds: number
}

export function createRedrawSnapshot(value: Omit<RedrawSnapshot, 'id'>): RedrawSnapshot {
  if (!value.prompt.trim()) throw new Error('请输入固定提示词')
  if (!value.items.length) throw new Error('请添加待重绘图片')
  if (value.references.length >= MAX_INPUT_IMAGES) throw new Error(`固定参考图最多 ${MAX_INPUT_IMAGES - 1} 张`)
  return {
    ...value,
    id: crypto.randomUUID(),
    prompt: value.prompt.trim(),
    references: [...value.references],
    items: value.items.map((item) => ({ ...item })),
    params: { ...value.params },
    settings: structuredClone(value.settings),
    concurrency: Math.min(10, Math.max(1, Math.round(value.concurrency) || 1)),
    intervalSeconds: Math.min(120, Math.max(0, Number(value.intervalSeconds) || 0)),
  }
}

/** 共享启动时钟，间隔只限制启动，运行中的请求仍占用并发槽位。 */
export async function runRedrawQueue<T>(
  items: T[],
  concurrency: number,
  intervalMs: number,
  worker: (item: T, index: number) => Promise<void>,
  signal: AbortSignal,
) {
  let next = 0
  let nextStart = 0
  let gate = Promise.resolve()
  const take = async () => {
    const previous = gate
    let release!: () => void
    gate = new Promise<void>((resolve) => { release = resolve })
    await previous
    try {
      if (signal.aborted || next >= items.length) return null
      const wait = Math.max(0, nextStart - Date.now())
      if (wait && !(await waitForBatchInterval(wait, signal))) return null
      if (signal.aborted) return null
      const index = next++
      nextStart = Date.now() + intervalMs
      return index
    } finally {
      release()
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (!signal.aborted) {
      const index = await take()
      if (index == null) return
      await worker(items[index], index)
    }
  }))
}

function waitForBatchInterval(ms: number, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    const finish = (ready: boolean) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      resolve(ready)
    }
    const cancel = () => finish(false)
    const timer = setTimeout(() => finish(true), ms)
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
  })
}

export function getRedrawInputImages(source: InputImage, references: InputImage[]) {
  // 源图放第一张，固定参考图只提供风格或内容参考。
  return [source, ...references.filter((image) => image.id !== source.id)]
    .filter((image, index, images) => images.findIndex((item) => item.id === image.id) === index)
}

export function getRedrawFileBase(sourceName: string, taskId: string) {
  const name = sanitizeFileNamePart(sourceName.replace(/\.[^.]+$/, '')) || 'image'
  return `${name}-${taskId}`
}
