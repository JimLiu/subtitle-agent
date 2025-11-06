import {
  generateId,
  joinWordsText,
  Paragraph,
  realignWordTimestamps,
  Word,
} from "@subtitle-agent/core";
import { correctTextWithLLM } from "@subtitle-agent/ai";

// 根据给定的词数组生成段落对象，保证时间戳和文本的基本结构
const createParagraph = (words: Word[]): Paragraph => {
  if (words.length === 0) {
    // 输入为空时返回占位段落，避免后续逻辑出现 null
    return {
      id: generateId(),
      start: 0,
      end: 0,
      text: "",
      words: [],
    };
  }

  // 对非空词序列按起止时间与原文重建段落
  return {
    id: generateId(),
    start: words[0].start,
    end: words[words.length - 1].end,
    text: words.map((w) => w.text).join(" "),
    words,
  };
};

// 使用大语言模型润色词序列，并返回重新分段后的结果
export const polishWords = async (
  words: Word[]
): Promise<{
  paragraphs: Paragraph[];
  correctedWords: Word[];
}> => {
  // 将全部词拼接成连续文本，作为大模型的输入数据
  const originalText = joinWordsText(words);

  // 调用大模型完成文本纠错与润色
  const correctionResult = await correctTextWithLLM(originalText);

  if (!correctionResult.success) {
    // 大模型返回失败时直接抛错，交由上层处理
    throw new Error("Failed to correct text with LLM");
  }

  // 按润色后的文本重算每个词的时间戳，确保仍与音频同步
  const correctedWords = realignWordTimestamps(
    words,
    correctionResult.correctedText
  );

  // 依据换行符重新划分段落，准备后续输出
  const paragraphs: Paragraph[] = [];
  let currentWords: Word[] = [];

  for (let i = 0; i < correctedWords.length; i++) {
    const word = correctedWords[i];

    // 处理换行符出现在词首的情况，意味着需要切换到新段落
    if (word.text.startsWith("\n")) {
      // 段落已有内容时先封装旧段落
      if (currentWords.length > 0) {
        paragraphs.push(createParagraph(currentWords));
        currentWords = [];
      }

      // 去掉前导换行符后，再加入新段落
      const cleanedWord = { ...word, text: word.text.replace(/^\n+/, "") };
      if (cleanedWord.text) {
        currentWords.push(cleanedWord);
      }
    }
    // 处理换行符出现在词尾的情况，表示当前段落需要收尾
    else if (word.text.endsWith("\n")) {
      // 去掉末尾换行符后加入当前段落
      const cleanedWord = { ...word, text: word.text.replace(/\n+$/, "") };
      if (cleanedWord.text) {
        currentWords.push(cleanedWord);
      }

      // 封装当前段落，后续开启新段落
      if (currentWords.length > 0) {
        paragraphs.push(createParagraph(currentWords));
        currentWords = [];
      }
    }
    // 没有换行符的普通词，直接继续累积
    else {
      currentWords.push(word);
    }
  }

  // 循环结束后若还有剩余词，补齐最后一个段落
  if (currentWords.length > 0) {
    paragraphs.push(createParagraph(currentWords));
  }

  // 极端情况下完全没有词也返回一个空段落，统一返回结构
  if (paragraphs.length === 0 && correctedWords.length === 0) {
    paragraphs.push(createParagraph([]));
  }

  // 返回润色后的段落集合，以及带有新时间戳的词
  return {
    paragraphs,
    correctedWords,
  };
};
