import { join } from "node:path";
import { homedir } from "node:os";

export const CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "matryoshka")
  : join(homedir(), ".config", "matryoshka");

export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
