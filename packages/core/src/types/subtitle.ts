export interface Word {
  id: string;
  text: string;
  start: number;
  end: number;
}

export interface Speaker {
  id: string;
  name: string;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  text: string;
  words: Word[];
  speakerId?: string;
}

export interface Paragraph {
  id: string;
  start: number;
  end: number;
  text: string;
  words: Word[];
  speakerId?: string;
}

export interface Chapter {
  id: string;
  start: number;
  end: number;
  title: string;
  summary: string;
  firstParagraphId: string;
  lastParagraphId: string;
}

export interface Subtitle {
  id: string;
  title: string;
  filename: string;
  language: string;
  speakers?: Speaker[];
  paragraphs: Paragraph[];
  chapters?: Chapter[];
}
