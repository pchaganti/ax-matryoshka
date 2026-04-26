import { readFile, writeFile } from "node:fs/promises";

export async function ensureBaseline<T>(
  path: string,
  generate: () => Promise<T>
): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    const data = await generate();
    await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
    return data;
  }
}
