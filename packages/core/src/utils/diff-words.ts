import { diffArrays } from "diff";
import { Word } from "../types/subtitle";

// 定义差异类型：添加、删除、修改或未变
type DiffType = "added" | "removed" | "modified" | "unchanged";

// 差异单词的基本接口，包含类型属性
interface DiffWordBase {
  type: DiffType;
}

// 已删除的单词接口，包含原始单词对象
interface DiffWordRemoved extends DiffWordBase {
  type: "removed";
  word: Word;
}

// 新增单词接口，只包含文本内容
interface DiffWordAdded extends DiffWordBase {
  type: "added";
  text: string;
}

// 未变化的单词接口，包含原始单词对象
interface DiffWordUnchanged extends DiffWordBase {
  type: "unchanged";
  word: Word;
}

// 修改过的单词接口，包含原始单词对象和新文本
interface DiffWordModified extends DiffWordBase {
  type: "modified";
  word: Word;
  text: string;
}

// 差异单词联合类型，可以是以上四种类型之一
export type DiffWord =
  | DiffWordRemoved
  | DiffWordAdded
  | DiffWordUnchanged
  | DiffWordModified;

/**
 * 比较两组单词并生成差异结果
 * @param oldWords 旧的单词数组，包含文本和时间戳
 * @param newWordTexts 新的单词文本数组
 * @param areWordsSame 可选的比较函数，用于判断单词是否相同。如果不提供，默认比较字符串相等
 * @returns 差异单词数组，表示添加、删除、修改或未变的单词
 */
export function diffWords(
  oldWords: Word[],
  newWordTexts: string[],
  areWordsSame?: (left: string, right: string) => boolean
): DiffWord[] {
  const oldWordTexts = oldWords.map((w) => w.text);
  const diff = diffArrays(oldWordTexts, newWordTexts, {
    comparator: (left: string, right: string) => {
      if (areWordsSame) {
        return areWordsSame(left, right);
      }
      return left === right;
    },
  });

  const result: DiffWord[] = [];

  let oldIndex = 0;
  let newIndex = 0;
  let i = 0;

  while (i < diff.length) {
    const change = diff[i];

    if (change.removed) {
      // Check if next change is an addition - this could indicate modification
      const nextChange = i + 1 < diff.length ? diff[i + 1] : null;

      if (nextChange && nextChange.added) {
        // Determine how many words can be treated as modifications
        const modificationCount = Math.min(change.count, nextChange.count);

        // Handle modifications first
        for (let j = 0; j < modificationCount; j++) {
          result.push({
            type: "modified",
            word: oldWords[oldIndex + j],
            text: newWordTexts[newIndex + j],
          });
        }

        // Handle remaining removals
        for (let j = modificationCount; j < change.count; j++) {
          result.push({
            type: "removed",
            word: oldWords[oldIndex + j],
          });
        }

        // Handle remaining additions
        for (let j = modificationCount; j < nextChange.count; j++) {
          result.push({
            type: "added",
            text: newWordTexts[newIndex + j],
          });
        }

        oldIndex += change.count;
        newIndex += nextChange.count;
        i += 2; // Skip both the removed and added changes
      } else {
        // Pure removal
        for (let j = 0; j < change.count; j++) {
          result.push({
            type: "removed",
            word: oldWords[oldIndex + j],
          });
        }
        oldIndex += change.count;
        i++;
      }
    } else if (change.added) {
      // Pure addition (not part of a modification pair)
      for (let j = 0; j < change.count; j++) {
        result.push({
          type: "added",
          text: newWordTexts[newIndex + j],
        });
      }
      newIndex += change.count;
      i++;
    } else {
      // Words that are common between old and new arrays
      for (let j = 0; j < change.count; j++) {
        const oldWord = oldWords[oldIndex + j];
        const newText = newWordTexts[newIndex + j];

        // Check if the word was actually modified
        // We need to use the same comparison logic as the diffArrays call
        let wordsAreSame = false;
        if (areWordsSame) {
          wordsAreSame = areWordsSame(oldWord.text, newText);
        } else {
          wordsAreSame = oldWord.text === newText;
        }

        if (wordsAreSame) {
          result.push({
            type: "unchanged",
            word: oldWord,
          });
        } else {
          result.push({
            type: "modified",
            word: oldWord,
            text: newText,
          });
        }
      }
      oldIndex += change.count;
      newIndex += change.count;
      i++;
    }
  }

  return result;
}
