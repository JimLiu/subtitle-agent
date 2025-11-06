import fs from "fs/promises";

export const readJSON = async <T>(path: string) => {
  if (!(await fileExists(path))) {
    return null;
  }

  const content = await fs.readFile(path, "utf8");
  return JSON.parse(content) as T;
};

export const writeJSON = async <T>(path: string, data: T) => {
  // Ensure directory exists
  const dir = path.substring(0, path.lastIndexOf("/"));
  await fs.mkdir(dir, { recursive: true });

  // Write JSON file
  await fs.writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
};

export const fileExists = async (path: string) => {
  return fs
    .access(path)
    .then(() => true)
    .catch(() => false);
};
