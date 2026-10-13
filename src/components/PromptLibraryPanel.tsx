import { useState } from 'react'
import { useStore } from '../store'
import { CloseIcon, PlusIcon, TrashIcon } from './icons'

export default function PromptLibraryPanel({ onClose }: { onClose: () => void }) {
  const prompt = useStore((s) => s.prompt)
  const setPrompt = useStore((s) => s.setPrompt)
  const templates = useStore((s) => s.promptLibrary)
  const addPromptTemplate = useStore((s) => s.addPromptTemplate)
  const updatePromptTemplate = useStore((s) => s.updatePromptTemplate)
  const deletePromptTemplate = useStore((s) => s.deletePromptTemplate)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(34rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-gray-200/80 bg-white/95 p-3 shadow-2xl backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-900/95">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200/70 pb-2 dark:border-white/[0.08]">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">个人提示词</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const id = addPromptTemplate({
                title: prompt.trim() ? '当前提示词' : undefined,
                text: prompt.trim(),
              })
              setEditingId(id)
            }}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-blue-600 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10"
          >
            <PlusIcon className="h-4 w-4" />
            新增
          </button>
          <button type="button" onClick={onClose} aria-label="关闭提示词库" className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-gray-200">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
        {templates.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-gray-400 dark:text-gray-500">暂无提示词</p>
        )}
        {templates.map((template) => {
          const editing = editingId === template.id
          return (
            <div key={template.id} className="rounded-lg border border-gray-200/70 bg-gray-50/80 p-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="flex items-center gap-2">
                <input
                  value={template.title}
                  onChange={(event) => updatePromptTemplate(template.id, { title: event.target.value })}
                  className="min-w-0 flex-1 bg-transparent px-1 text-xs font-medium text-gray-800 outline-none dark:text-gray-100"
                  aria-label="提示词标题"
                />
                <button type="button" onClick={() => setPrompt(template.text)} disabled={!template.text.trim()} className="rounded-lg px-2 py-1 text-[11px] text-blue-600 transition hover:bg-blue-100 disabled:opacity-40 dark:text-blue-300 dark:hover:bg-blue-500/10">
                  使用
                </button>
                <button type="button" onClick={() => setEditingId(editing ? null : template.id)} className="rounded-lg px-2 py-1 text-[11px] text-gray-500 transition hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-white/[0.08]">
                  {editing ? '收起' : '编辑'}
                </button>
                <button type="button" onClick={() => deletePromptTemplate(template.id)} aria-label={`删除${template.title}`} className="rounded-lg p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              {editing && (
                <textarea
                  value={template.text}
                  onChange={(event) => updatePromptTemplate(template.id, { text: event.target.value })}
                  rows={5}
                  placeholder="输入固定提示词..."
                  className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:border-blue-400 dark:border-white/[0.08] dark:bg-gray-950/50 dark:text-gray-100"
                />
              )}
              {!editing && (
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap px-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  {template.text}
                </p>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
