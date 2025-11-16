import { promises as fs } from 'fs'
import path from 'path'

export interface SubtitleSpeaker {
  id: string
  name: string
}

export interface SubtitleWord {
  start: number
  end: number
  text: string
}

export interface SubtitleSegment {
  id: string
  start: number
  end: number
  text: string
  words: SubtitleWord[]
}

export interface SubtitleParagraph {
  id: string
  start: number
  end: number
  text: string
  speakerId?: string
  translation?: string
  words: SubtitleWord[]
  segments: SubtitleSegment[]
}

export interface TranslatedSubtitle {
  id: string
  title: string
  filename: string
  language: string
  speakers: SubtitleSpeaker[]
  paragraphs: SubtitleParagraph[]
}

const DEFAULT_VIDEO_ID = '1'

export async function loadTranslatedSubtitle(videoId: string = DEFAULT_VIDEO_ID) {
  const filePath = path.join(process.cwd(), 'public', videoId, 'translated-subtitle.json')
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw) as TranslatedSubtitle
}
