import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { SettingsIcon, HistoryIcon, EditIcon } from './icons'
import { TooltipButton } from './TooltipButton'
import HistoryModal from './HistoryModal'

export default function Header() {
  const appMode = useStore((s) => s.appMode)
  const setAppMode = useStore((s) => s.setAppMode)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const createConversation = useStore((s) => s.createAgentConversation)
  const activeConversationId = useStore((s) => s.activeAgentConversationId)
  const activeConversation = useStore((s) => s.agentConversations.find((item) => item.id === activeConversationId))
  const [showHistory, setShowHistory] = useState(false)
  const historyButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    document.title = '图片重绘'
  }, [appMode])

  return (
    <>
      <header className="safe-area-top fixed left-0 right-0 top-0 z-40 border-b border-gray-200 bg-white/85 backdrop-blur dark:border-white/[0.08] dark:bg-gray-950/85">
        <div className="safe-area-x safe-header-inner mx-auto flex max-w-7xl items-center justify-between gap-1 sm:gap-3">
          <h1 className="hidden min-w-0 truncate text-[17px] font-bold text-gray-800 sm:block dark:text-gray-100">图片重绘</h1>
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <nav className="flex shrink-0 items-center gap-0.5 rounded-lg bg-black/[0.04] p-1 dark:bg-white/[0.06]" aria-label="主要工作区">
              <button type="button" onClick={() => setAppMode('agent')} className={`rounded-lg px-3 py-1.5 text-xs transition ${appMode === 'agent' ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/[0.12] dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}>图片会话</button>
              <button type="button" onClick={() => setAppMode('gallery')} className={`rounded-lg px-3 py-1.5 text-xs transition ${appMode === 'gallery' ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/[0.12] dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}>历史图片</button>
              <button type="button" onClick={() => setAppMode('batch')} className={`rounded-lg px-3 py-1.5 text-xs transition ${appMode === 'batch' ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/[0.12] dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}>批量重绘</button>
            </nav>
          </div>
          <div className="flex shrink-0 items-center">
            {appMode === 'agent' && activeConversation && (
              <>
                <button ref={historyButtonRef} type="button" aria-label="历史会话" title="历史会话" onClick={() => setShowHistory((visible) => !visible)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.08]"><HistoryIcon className="h-5 w-5" /></button>
                <TooltipButton tooltip="新对话" onClick={createConversation} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.08]"><EditIcon className="h-5 w-5" /></TooltipButton>
              </>
            )}
            <TooltipButton tooltip="设置" onClick={() => setShowSettings(true)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.08]"><SettingsIcon className="h-5 w-5" /></TooltipButton>
          </div>
        </div>
      </header>
      <div className="safe-area-top invisible pointer-events-none" aria-hidden="true"><div className="safe-header-inner" /></div>
      {showHistory && <HistoryModal onClose={() => setShowHistory(false)} ignoreOutsideClickRef={historyButtonRef} />}
    </>
  )
}
