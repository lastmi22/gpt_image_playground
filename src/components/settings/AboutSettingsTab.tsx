import { ExternalLinkIcon, GithubIcon } from '../icons'

export default function AboutSettingsTab({ onOpenFontLicenses }: { onOpenFontLicenses: () => void }) {
  const linkClass = 'flex min-h-12 items-center justify-between gap-3 border-b border-gray-200 py-3 text-sm text-gray-700 hover:text-blue-600 dark:border-white/[0.08] dark:text-gray-300 dark:hover:text-blue-300'

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">图片重绘</h4>
        <p className="mt-1 text-xs text-gray-500">个人开发版 · 基于 v{__APP_VERSION__}</p>
      </div>
      <div>
        <a className={linkClass} href="https://github.com/lastmi22/gpt_image_playground" target="_blank" rel="noopener noreferrer">
          <span className="flex items-center gap-2"><GithubIcon className="h-4 w-4" />个人仓库</span>
          <ExternalLinkIcon className="h-4 w-4" />
        </a>
        <a className={linkClass} href="https://github.com/lastmi22/gpt_image_playground/issues" target="_blank" rel="noopener noreferrer">
          反馈问题<ExternalLinkIcon className="h-4 w-4" />
        </a>
        <button type="button" onClick={onOpenFontLicenses} className={`${linkClass} w-full text-left`}>
          字体与第三方许可<ExternalLinkIcon className="h-4 w-4" />
        </button>
      </div>
      <p data-selectable-text className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        基于 <a href="https://github.com/CookSleep/gpt_image_playground" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">GPT Image Playground</a> 修改。
        原作者 <a href="https://github.com/CookSleep" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">@CookSleep</a>，
        采用 <a href="https://github.com/CookSleep/gpt_image_playground/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">MIT 许可证</a>。
      </p>
    </div>
  )
}
