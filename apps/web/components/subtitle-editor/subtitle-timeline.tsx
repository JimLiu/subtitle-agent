'use client'

import * as React from 'react'
import type { JSONContent } from '@tiptap/core'
import { SegmentEditor } from '@/components/subtitle-editor/segment-editor'
import type { SubtitleParagraph, SubtitleSegment, SubtitleSpeaker } from '@/lib/subtitles'
import { cn } from '@/lib/utils'

interface SubtitleTimelineProps {
  paragraphs: SubtitleParagraph[]
  speakers: SubtitleSpeaker[]
}

type TimelineSegment = SubtitleSegment & {
  speakerId?: string
}

const SPEAKER_COLORS = [
  {
    gradient: 'from-sky-400 via-sky-500 to-blue-600',
    pip: 'bg-sky-400',
  },
  {
    gradient: 'from-fuchsia-400 via-pink-500 to-rose-500',
    pip: 'bg-pink-400',
  },
  {
    gradient: 'from-emerald-400 via-emerald-500 to-teal-600',
    pip: 'bg-emerald-400',
  },
]

const DEFAULT_COLORS = {
  gradient: 'from-slate-400 via-slate-500 to-slate-600',
  pip: 'bg-slate-400',
}

const formatTimestamp = (value: number) => value.toFixed(2).padStart(5, '0')

const wordsToJSONContent = (segment: SubtitleSegment): JSONContent => ({
  type: 'doc',
  content: segment.words.map((word, index) => ({
    type: 'word',
    attrs: {
      id: `${segment.id}-word-${index}`,
    },
    content: [{ type: 'text', text: word.text }],
  })),
})

const getInitials = (name?: string) => {
  if (!name) return '?'
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function SubtitleTimeline({ paragraphs, speakers }: SubtitleTimelineProps) {
  const segmentsWithSpeaker = React.useMemo<TimelineSegment[]>(
    () =>
      paragraphs.flatMap((paragraph) =>
        paragraph.segments.map((segment) => ({
          ...segment,
          speakerId: paragraph.speakerId,
        })),
      ),
    [paragraphs],
  )

  const [segmentValues, setSegmentValues] = React.useState<Record<string, JSONContent>>(() =>
    Object.fromEntries(segmentsWithSpeaker.map((segment) => [segment.id, wordsToJSONContent(segment)])),
  )

  React.useEffect(() => {
    setSegmentValues((previous) => {
      if (segmentsWithSpeaker.every((segment) => previous[segment.id])) {
        return previous
      }

      return Object.fromEntries(segmentsWithSpeaker.map((segment) => [segment.id, wordsToJSONContent(segment)]))
    })
  }, [segmentsWithSpeaker])

  const speakerLookup = React.useMemo(
    () =>
      speakers.reduce<
        Record<
          string,
          {
            speaker: SubtitleSpeaker
            colors: (typeof SPEAKER_COLORS)[number]
          }
        >
      >((acc, speaker, index) => {
        acc[speaker.id] = {
          speaker,
          colors: SPEAKER_COLORS[index % SPEAKER_COLORS.length],
        }
        return acc
      }, {}),
    [speakers],
  )

  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-[67px] top-0 h-full w-px bg-slate-200" aria-hidden="true" />
      <div className="space-y-8">
        {segmentsWithSpeaker.map((segment) => {
          const lookup = segment.speakerId ? speakerLookup[segment.speakerId] : undefined
          const colors = lookup?.colors ?? DEFAULT_COLORS
          const speakerName = lookup?.speaker.name ?? 'Unknown Speaker'
          const initials = getInitials(lookup?.speaker.name)
          const value = segmentValues[segment.id] ?? wordsToJSONContent(segment)

          return (
            <div key={segment.id} className="grid grid-cols-[120px_1fr] gap-6">
              <div className="flex flex-col items-center text-center text-xs text-slate-500">
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b text-sm font-semibold uppercase text-white shadow-lg shadow-slate-900/5',
                    colors.gradient,
                  )}
                >
                  {initials}
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">{speakerName}</p>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute -left-[11px] top-6 flex items-center justify-center">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow ring-1 ring-slate-200">
                    <span className={cn('h-2 w-2 rounded-full', colors.pip)} />
                  </span>
                </div>
                <article className="rounded-3xl border border-slate-100 bg-white px-6 py-5 shadow-[0_15px_40px_rgba(15,23,42,0.08)]">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {formatTimestamp(segment.start)}
                  </div>
                  <SegmentEditor
                    value={value}
                    onValueChange={(next) =>
                      setSegmentValues((previous) => ({
                        ...previous,
                        [segment.id]: next,
                      }))
                    }
                    editable
                    className="mt-3 min-h-[40px] text-lg leading-8 tracking-tight text-slate-900"
                  />
                  <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {formatTimestamp(segment.end)}
                  </div>
                </article>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
