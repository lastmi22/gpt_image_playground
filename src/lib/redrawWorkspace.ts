import { create } from 'zustand'
import type { RedrawItem } from './redrawBatch'

interface RedrawWorkspace {
  prompt: string
  references: RedrawItem[]
  sources: RedrawItem[]
  concurrency: number
  intervalSeconds: number
  activeBatchId: string | null
  taskIds: Record<string, string>
  errors: Record<string, string>
  running: boolean
  stopped: boolean
  controller: AbortController | null
}

// 文件只保存在当前页面内存中；已提交任务和结果由主库保存。
export const useRedrawWorkspace = create<RedrawWorkspace>(() => ({
  prompt: '',
  references: [],
  sources: [],
  concurrency: 3,
  intervalSeconds: 5,
  activeBatchId: null,
  taskIds: {},
  errors: {},
  running: false,
  stopped: false,
  controller: null,
}))
