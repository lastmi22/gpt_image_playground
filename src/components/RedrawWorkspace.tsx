import { useEffect, useRef, useState } from 'react'
import { createInputImageFromFile, submitRedrawTask, useStore } from '../store'
import { MAX_INPUT_IMAGES, type InputImage } from '../types'
import { getActiveApiProfile, validateApiProfile } from '../lib/apiProfiles'
import { createRedrawSnapshot, getRedrawFileBase, getRedrawInputImages, runRedrawQueue, type RedrawItem } from '../lib/redrawBatch'
import { useRedrawWorkspace } from '../lib/redrawWorkspace'
import { ensureImageCached } from '../lib/imageCache'
import { downloadImageEntriesAsZip, getImageZipEntries } from '../lib/downloadImages'
import { saveFile } from '../lib/saveFile'
import { CloseIcon, DownloadIcon, EditIcon, PlusIcon, RefreshIcon } from './icons'
import { TooltipButton } from './TooltipButton'

function SourceThumb({ item }: { item: RedrawItem }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(item.file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [item.file])
  return <img src={src} alt={item.name} className="h-full w-full object-contain" />
}

function ResultThumb({ imageId }: { imageId: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let active = true
    void ensureImageCached(imageId).then((url) => { if (active) setSrc(url || '') })
    return () => { active = false }
  }, [imageId])
  return <img src={src} alt="重绘结果" className="h-full w-full object-contain" />
}

export default function RedrawWorkspace() {
  const batch = useRedrawWorkspace()
  const templates = useStore((s) => s.promptLibrary)
  const settings = useStore((s) => s.settings)
  const params = useStore((s) => s.params)
  const setParams = useStore((s) => s.setParams)
  const tasks = useStore((s) => s.tasks)
  const showToast = useStore((s) => s.showToast)
  const sourceInput = useRef<HTMLInputElement>(null)
  const referenceInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [historyBatchId, setHistoryBatchId] = useState<string | null>(null)
  const batches = [...new Set(tasks.map((task) => task.redrawBatchId).filter((id): id is string => Boolean(id)))]
  const shownBatchId = historyBatchId ?? batch.activeBatchId
  const batchTasks = tasks.filter((task) => task.redrawBatchId === shownBatchId)
  const done = batchTasks.filter((task) => task.status === 'done').length
  const failed = batchTasks.filter((task) => task.status === 'error').length
  const running = batchTasks.filter((task) => task.status === 'running').length
  const activeProfile = getActiveApiProfile(settings)
  const locked = batch.running || busy
  const retryable = batch.sources.some((item) => {
    const task = tasks.find((task) => task.id === batch.taskIds[item.id])
    return !task || task.status === 'error' || Boolean(batch.errors[item.id])
  })

  const addFiles = (files: File[], references = false) => {
    if (locked) return
    const items = files.filter((file) => file.type.startsWith('image/')).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      file,
    }))
    useRedrawWorkspace.setState((state) => references
      ? { references: [...state.references, ...items].slice(0, MAX_INPUT_IMAGES - 1) }
      : { sources: [...state.sources, ...items] })
  }

  const start = async (onlyFailed = false) => {
    if (locked) return
    try {
      const error = validateApiProfile(activeProfile)
      if (error) {
        useStore.getState().setShowSettings(true, 'api')
        throw new Error(`请先配置 API：${error}`)
      }
      const items = onlyFailed
        ? batch.sources.filter((item) => {
            const task = tasks.find((task) => task.id === batch.taskIds[item.id])
            return !task || task.status === 'error' || Boolean(batch.errors[item.id])
          })
        : batch.sources
      const snapshot = createRedrawSnapshot({
        prompt: batch.prompt,
        references: batch.references.map((item) => item.file),
        items,
        settings,
        params,
        concurrency: batch.concurrency,
        intervalSeconds: batch.intervalSeconds,
      })
      if (onlyFailed && batch.activeBatchId) snapshot.id = batch.activeBatchId
      const controller = new AbortController()
      setHistoryBatchId(null)
      useRedrawWorkspace.setState({
        running: true,
        stopped: false,
        controller,
        activeBatchId: snapshot.id,
        taskIds: onlyFailed ? { ...batch.taskIds } : {},
        errors: {},
      })
      const references: InputImage[] = []
      for (const file of snapshot.references) {
        if (controller.signal.aborted) break
        const image = await createInputImageFromFile(file)
        if (image) references.push(image)
      }
      await runRedrawQueue(snapshot.items, snapshot.concurrency, snapshot.intervalSeconds * 1000, async (item) => {
        try {
          const source = await createInputImageFromFile(item.file)
          if (!source) throw new Error('文件不是图片')
          if (controller.signal.aborted) return
          await submitRedrawTask({
            batchId: snapshot.id,
            sourceName: item.name,
            prompt: snapshot.prompt,
            inputImages: getRedrawInputImages(source, references),
            params: snapshot.params,
            settings: snapshot.settings,
            onCreated: (taskId) => useRedrawWorkspace.setState((state) => ({
              taskIds: { ...state.taskIds, [item.id]: taskId },
            })),
          })
        } catch (err) {
          console.error('批量重绘失败', err)
          useRedrawWorkspace.setState((state) => ({
            errors: { ...state.errors, [item.id]: err instanceof Error ? err.message : String(err) },
          }))
        }
      }, controller.signal)
      const current = useRedrawWorkspace.getState()
      const failedCount = Object.keys(current.errors).length + snapshot.items.filter((item) => {
        const task = useStore.getState().tasks.find((task) => task.id === current.taskIds[item.id])
        return task?.status === 'error'
      }).length
      showToast(
        controller.signal.aborted ? '已停止启动新任务，已提交任务已结束'
          : failedCount ? `批量重绘结束，${failedCount} 张失败` : '批量重绘已完成',
        failedCount ? 'error' : 'success',
      )
    } catch (err) {
      console.error('启动批量重绘失败', err)
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      useRedrawWorkspace.setState({ running: false, controller: null })
    }
  }

  const exportManifest = async () => {
    await saveFile(new Blob([JSON.stringify({
      batchId: shownBatchId,
      exportedAt: new Date().toISOString(),
      tasks: batchTasks.map((task) => ({
        id: task.id,
        sourceName: task.sourceName,
        prompt: task.prompt,
        params: task.params,
        model: task.apiModel,
        status: task.status,
        error: task.error,
        inputImageIds: task.inputImageIds,
        results: getImageZipEntries(task.outputImages, getRedrawFileBase(task.sourceName || 'image', task.id)),
      })),
    }, null, 2)], { type: 'application/json' }), `batch-${shownBatchId}.json`)
  }

  const fieldClass = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 disabled:opacity-50 dark:border-white/[0.1] dark:bg-gray-900 dark:text-gray-100'

  return (
    <main className="mx-auto grid max-w-7xl gap-0 px-4 pb-10 pt-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <section className="border-b border-gray-200 pb-6 lg:border-b-0 lg:border-r lg:pr-6 dark:border-white/[0.08]">
        <h2 className="mb-5 text-lg font-semibold text-gray-900 dark:text-gray-100">批量重绘</h2>
        <div className="space-y-4">
          <label className="block space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span>个人提示词</span>
            <select className={fieldClass} value="" disabled={locked} onChange={(event) => {
              const template = templates.find((item) => item.id === event.target.value)
              if (template) useRedrawWorkspace.setState({ prompt: template.text })
            }}>
              <option value="">选择模板</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span>固定提示词</span>
            <textarea value={batch.prompt} disabled={locked} onChange={(event) => useRedrawWorkspace.setState({ prompt: event.target.value })} rows={7} className={`${fieldClass} h-auto resize-y py-2 leading-relaxed`} placeholder="每张源图使用同一条重绘指令..." />
          </label>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">固定参考图 · {batch.references.length}</span>
              <TooltipButton tooltip="添加固定参考图" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.08]" disabled={locked} onClick={() => referenceInput.current?.click()}><PlusIcon className="h-4 w-4" /></TooltipButton>
            </div>
            <input ref={referenceInput} type="file" multiple accept="image/*" className="hidden" onChange={(event) => { addFiles(Array.from(event.target.files || []), true); event.target.value = '' }} />
            <div className="flex flex-wrap gap-2">
              {batch.references.map((item) => (
                <div key={item.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200 dark:border-white/[0.1]">
                  <SourceThumb item={item} />
                  <button disabled={locked} type="button" aria-label={`移除参考图${item.name}`} onClick={() => useRedrawWorkspace.setState({ references: batch.references.filter((image) => image.id !== item.id) })} className="absolute right-0 top-0 rounded-bl bg-white/90 p-0.5 text-gray-500"><CloseIcon className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">并发数<input type="number" min={1} max={10} value={batch.concurrency} disabled={locked} className={fieldClass} onChange={(event) => useRedrawWorkspace.setState({ concurrency: Number(event.target.value) })} /></label>
            <label className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">启动间隔 / 秒<input type="number" min={0} max={120} step={0.5} value={batch.intervalSeconds} disabled={locked} className={fieldClass} onChange={(event) => useRedrawWorkspace.setState({ intervalSeconds: Number(event.target.value) })} /></label>
            <label className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">尺寸<select value={params.size} disabled={locked} className={fieldClass} onChange={(event) => setParams({ size: event.target.value })}>
              {[...new Set(['auto', '1024x1024', '1024x1536', '1536x1024', params.size])].map((size) => <option key={size} value={size}>{size === 'auto' ? '自动' : size}</option>)}
            </select></label>
            <label className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">质量<select value={params.quality} disabled={locked} className={fieldClass} onChange={(event) => setParams({ quality: event.target.value as typeof params.quality })}>
              {['auto', 'low', 'medium', 'high'].map((quality) => <option key={quality}>{quality}</option>)}
            </select></label>
            <label className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">格式<select value={params.output_format} disabled={locked} className={fieldClass} onChange={(event) => setParams({ output_format: event.target.value as typeof params.output_format })}>
              {['png', 'jpeg', 'webp'].map((format) => <option key={format}>{format}</option>)}
            </select></label>
            <label className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">每张结果数<input type="number" min={1} max={10} value={params.n} disabled={locked} className={fieldClass} onChange={(event) => setParams({ n: Math.min(10, Math.max(1, Number(event.target.value) || 1)) })} /></label>
          </div>
          <div className="truncate border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-white/[0.08] dark:text-gray-400" title={activeProfile.model}>{activeProfile.name} · {activeProfile.model}</div>
          <button type="button" disabled={locked || !batch.sources.length || !batch.prompt.trim()} onClick={() => void start()} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-35 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"><EditIcon className="h-4 w-4" />开始重绘 {batch.sources.length} 张</button>
          {batch.running && <button type="button" disabled={batch.stopped} onClick={() => { batch.controller?.abort(); useRedrawWorkspace.setState({ stopped: true }) }} className="h-9 w-full rounded-lg border border-red-200 text-xs text-red-600 disabled:opacity-40 dark:border-red-900">{batch.stopped ? '等待已提交任务完成' : '停止启动新任务'}</button>}
        </div>
      </section>

      <section className="min-w-0 pt-6 lg:pl-6 lg:pt-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100">待重绘图片 <span className="ml-1 text-gray-400">{batch.sources.length}</span></h3>
          <div className="flex items-center gap-1">
            <TooltipButton tooltip="重试失败或未提交图片" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.08]" disabled={locked || !batch.activeBatchId || shownBatchId !== batch.activeBatchId || !retryable} onClick={() => void start(true)}><RefreshIcon className="h-4 w-4" /></TooltipButton>
            <button type="button" disabled={locked} onClick={() => sourceInput.current?.click()} className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.1] dark:text-gray-300 dark:hover:bg-white/[0.04]"><PlusIcon className="h-4 w-4" />添加图片</button>
          </div>
        </div>
        <input ref={sourceInput} type="file" multiple accept="image/*" className="hidden" onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = '' }} />
        <div
          tabIndex={0}
          aria-label="待重绘图片"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)) }}
          onPaste={(event) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); addFiles(files) } }}
          className="mb-6 min-h-32 rounded-lg border border-dashed border-gray-300 p-3 outline-none focus:border-blue-400 dark:border-white/[0.15]"
        >
          {!batch.sources.length && <button type="button" onClick={() => sourceInput.current?.click()} className="flex min-h-32 w-full flex-col items-center justify-center gap-2 text-xs text-gray-400"><PlusIcon className="h-6 w-6" />添加源图</button>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-3">
            {batch.sources.map((item) => {
              const task = tasks.find((task) => task.id === batch.taskIds[item.id])
              const error = batch.errors[item.id]
              return <div key={item.id} className="min-w-0">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-white/[0.04]">
                  <SourceThumb item={item} />
                  {!locked && <button type="button" aria-label={`移除源图${item.name}`} onClick={() => useRedrawWorkspace.setState({ sources: batch.sources.filter((image) => image.id !== item.id) })} className="absolute right-1 top-1 rounded bg-white/90 p-1 text-gray-500"><CloseIcon className="h-3 w-3" /></button>}
                </div>
                <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400" title={item.name}>{item.name}</p>
                <p className={`text-[10px] ${error || task?.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>{error ? '失败' : task?.status === 'done' ? '完成' : task?.status === 'running' ? '运行中' : batch.stopped ? '未提交' : '待提交'}</p>
              </div>
            })}
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-white/[0.08]">
          <div className="flex min-w-0 items-center gap-3">
            <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100">结果</h3>
            {batches.length > 0 && <select aria-label="历史批次" value={shownBatchId || ''} onChange={(event) => setHistoryBatchId(event.target.value)} className="max-w-44 truncate rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
              <option value="">选择批次</option>
              {batches.map((id) => <option key={id} value={id}>{new Date(tasks.find((task) => task.redrawBatchId === id)!.createdAt).toLocaleString()}</option>)}
            </select>}
          </div>
          <div className="flex items-center gap-1">
            <button disabled={!batchTasks.length || busy} type="button" onClick={() => void exportManifest().catch((err) => showToast(String(err), 'error'))} className="rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-35 dark:text-gray-400 dark:hover:bg-white/[0.06]">清单</button>
            <TooltipButton tooltip="下载本批次结果" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.08]" disabled={!done || busy} onClick={() => {
              setBusy(true)
              void downloadImageEntriesAsZip(batchTasks.flatMap((task) => getImageZipEntries(task.outputImages, getRedrawFileBase(task.sourceName || 'image', task.id))), `redraw-${shownBatchId}`)
                .then((result) => { if (!result.canceled) showToast(`已导出 ${result.successCount} 张图片`, result.failCount ? 'error' : 'success') })
                .catch((err) => showToast(String(err), 'error'))
                .finally(() => setBusy(false))
            }}><DownloadIcon className="h-4 w-4" /></TooltipButton>
          </div>
        </div>
        {batchTasks.length > 0 && <p className="mb-4 text-xs text-gray-400">{done} 完成 · {running} 运行中 · {failed} 失败</p>}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {batchTasks.map((task) => <div key={task.id} className="min-w-0">
            <button type="button" onClick={() => useStore.getState().setDetailTaskId(task.id)} className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03]">
              {task.outputImages[0] ? <ResultThumb imageId={task.outputImages[0]} /> : <span className={`px-3 text-center text-xs ${task.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>{task.status === 'running' ? '正在重绘' : '生成失败'}</span>}
            </button>
            <p className="mt-1.5 truncate text-xs text-gray-600 dark:text-gray-300" title={task.sourceName}>{task.sourceName}</p>
            {task.error && <p className="mt-1 line-clamp-2 text-[11px] text-red-500">{task.error}</p>}
          </div>)}
        </div>
      </section>
    </main>
  )
}
