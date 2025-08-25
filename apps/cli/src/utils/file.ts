import fs from "fs/promises";

export const readJSON = async <T>(path: string) => {
  const content = await fs.readFile(path, "utf8");
  return JSON.parse(content) as T;
};

export const writeJSON = async <T>(path: string, data: T) => {
  await fs.writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
};

export const fileExists = async (path: string) => {
  return fs
    .access(path)
    .then(() => true)
    .catch(() => false);
};
