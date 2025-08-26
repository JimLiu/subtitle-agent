import { generateId } from "./ids";
import { Word } from "../types/subtitle";

/**
 * 根据文本分词（包括拼写、中文、标点、空白等），返回切分后的数组
 * @param text 要分词的文本
 * @returns 分词结果数组
 */
export function generateTextMaterialWordsText(text: string): string[] {
  if (text.length === 0) return [];

  // 正则表达式：尽量匹配各种情况，如 Dr. , Co. , 汉字，标点，空白等
  // 注意：\p{Script=Latin} 需要 ES2018+ 的正则才支持
  // 如果你的编译环境较老，需要 polyfill 或转义
  const reg = new RegExp(
    "((St\\.|Dr\\.|Co\\.|Rd\\.)[\\p{Script=Latin}\\w]+)|(-?[\\p{Script=Latin}\\w]+(?:[-'][\\p{Script=Latin}\\w]+)*-?)|([\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}])|(\\p{P}+)|(\\s+)",
    "gu"
  );
  const matches = text.match(reg);

  const result: string[] = [];
  let buffer = "";

  // push result
  const pushPiece = (content: string) => {
    if (content !== "") {
      const lastResult = result[result.length - 1];
      if (lastResult && /^\s+$/u.test(lastResult)) {
        result[result.length - 1] += content;
      } else {
        result.push(content);
      }
    }
  };

  if (matches) {
    for (const piece of matches) {
      // 检查是否为CJK标点符号（全角标点）
      const isCJKPunctuation = /^[\u3000-\u303F\uFF00-\uFFEF]+$/.test(piece);

      // 如果是纯标点，则先拼接到 buffer
      if (new RegExp("^\\p{P}+$", "u").test(piece)) {
        if (isCJKPunctuation) {
          // CJK标点单独处理，作为独立部分
          if (buffer !== "") {
            pushPiece(buffer);
            buffer = "";
          }
          pushPiece(piece);
        } else {
          // 西文标点拼接到 buffer
          buffer += piece;
        }
      } else {
        // 否则如果 buffer 不空，则先推入 result，再清空
        if (buffer !== "") {
          pushPiece(buffer);
          buffer = "";
        }
        buffer = piece;
      }
    }
    // 循环结束后如果 buffer 不为空，也要 push
    if (buffer !== "") {
      pushPiece(buffer);
    }
  }
  return result;
}

const specialWords = new Set(["mrs.", "ms.", "mr.", "dr.", "prof.", "st."]);

/**
 * 判断该单词是否为一个 segment 的结尾单词
 * 如果需要过滤特殊词，可在 specialWords 里进行配置
 */
export function isEndOfSegment(word: string): boolean {
  if (specialWords.has(word.trim().toLowerCase())) {
    return false;
  }
  // 匹配常见结尾标点: . ! ? ， 。 ！ ？ … ]
  // 注意 \s*$ 用来匹配后面可能存在的空格
  return /[,.!?，。！？…\]]\s*$/.test(word);
}

export function isEndOfSentence(text: string) {
  if (specialWords.has(text.trim().toLowerCase())) {
    return false;
  }
  return !!text.match(/([.?!。！？…)])$|(--)$/);
}

/**
 * 比较两个单词是否相同（大小写不敏感）
 * @param word1 第一个单词
 * @param word2 第二个单词
 * @returns 是否相同
 */
export function areWordsSame(word1: string, word2: string): boolean {
  // // 1. 去掉前后空格并转换为小写
  // const trimmed1 = word1.trim().toLowerCase().replace(/[,.]$/, '');
  // const trimmed2 = word2.trim().toLowerCase().replace(/[,.]$/, '');
  // return trimmed1 === trimmed2;
  return word1 === word2;
}

export const importWords = (
  originalWords: Array<
    | {
        id?: string;
        start: number;
        end: number;
        word: string;
      }
    | {
        id?: string;
        start: number;
        end: number;
        text: string;
      }
  >
): Word[] => {
  return originalWords
    .map((word) => {
      const start = word.start;
      const end = word.end;
      const text = "word" in word ? word.word : word.text;
      const textWords = generateTextMaterialWordsText(text);

      // 如果只有一个分词，直接返回
      if (textWords.length <= 1) {
        return [
          {
            id: word.id || generateId(),
            start,
            end,
            text: text,
          },
        ];
      }

      // 计算总字符数和每个分词的字符数
      const totalChars = text.length;
      const duration = end - start;

      const words: Word[] = [];
      let currentStart = start;

      for (const [i, textWord] of textWords.entries()) {
        const charCount = textWord.length;

        // 按字符数比例分配时间
        const wordDuration = (charCount / totalChars) * duration;
        const wordEnd =
          i === textWords.length - 1 ? end : currentStart + wordDuration;

        words.push({
          id: generateId(),
          start: currentStart,
          end: wordEnd,
          text: textWord,
        });

        currentStart = wordEnd;
      }

      return words;
    })
    .flat();
};

/**
 * Joins word texts into a single string for LLM processing
 */
export function joinWordsText(words: Word[]): string {
  return words.map((word) => word.text).join("");
}
