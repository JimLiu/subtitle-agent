import type { Word } from "../types/subtitle";
import { generateTextMaterialWordsText, importWords } from "./words";
import { DiffWord, diffWords } from "./diff-words";
import { generateId } from "./ids";

export function updateWordsFromText(
  originalWords: Array<Word>,
  newText: string
): Array<Word> {
  if (!originalWords.length) return [];
  if (!newText) return [];

  const words = importWords(originalWords);

  // 2. 分词得到新文本 token
  const newTokens = generateTextMaterialWordsText(newText);

  // 3. 使用 diffWords 计算差异
  const diffs = diffWords(words, newTokens);

  // 4. 根据差异构建新的 words 数组
  const result: Word[] = [];
  let lastEndTime = words[0].start;
  let prevDiff: DiffWord | null = null;
  let prevWord: Word | null = null;

  diffs.forEach((diff, index) => {
    let word: Word | null = null;
    switch (diff.type) {
      case "unchanged":
        // 对于未改变或删除的词，保持原样
        result.push(diff.word);
        lastEndTime = diff.word.end;
        word = diff.word;
        break;
      case "modified":
        // 对于修改的词，保持时间戳不变，更新文本
        word = {
          ...diff.word,
          text: diff.text,
        };
        result.push(word);
        lastEndTime = diff.word.end;
        break;
      case "added":
        // 对于新增的词，使用上一个词的结束时间作为开始和结束时间
        word = {
          text: diff.text,
          start: lastEndTime,
          end: lastEndTime,
          id: generateId(),
        };
        result.push(word);
        break;
      case "removed": {
        // 如果前一个词是修改的，则说明这个删除的词是修改的词的一部分，比如合并了两个词
        // 需要更新结束时间
        if (prevDiff?.type === "modified" && prevWord) {
          lastEndTime = diff.word.end;
          prevWord.end = lastEndTime;
        }
        break;
      }
    }
    prevDiff = diff;
    prevWord = word;
  });

  return result;
}
