import { Chapter, Paragraph, Segment, Subtitle } from "./subtitle";

export interface TranslatedSegment extends Segment {
  translation?: string;
}


export interface TranslatedParagraph extends Paragraph {
  translation?: string;
  segments?: TranslatedSegment[];
}

export interface TranslatedSubtitle extends Subtitle {
  targetLanguage: string;
  paragraphs: TranslatedParagraph[];
}