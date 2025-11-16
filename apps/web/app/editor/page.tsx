import { loadTranslatedSubtitle } from '@/lib/subtitles'
import { SubtitleTimeline } from '@/components/subtitle-editor/subtitle-timeline'

export const metadata = {
  title: 'Subtitle Editor',
  description: 'Timeline editor preview for translated subtitles',
}

export default async function EditorPage() {
  const subtitle = await loadTranslatedSubtitle()

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 sm:px-0">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Timeline</p>
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">{subtitle.title}</h1>
            <p className="text-sm text-slate-500">{subtitle.filename}</p>
          </div>
          <p className="text-sm text-slate-500">
            {subtitle.speakers.length} Speakers · Language: {subtitle.language.toUpperCase()}
          </p>
        </header>
        <SubtitleTimeline paragraphs={subtitle.paragraphs} speakers={subtitle.speakers} />
      </div>
    </div>
  )
}
