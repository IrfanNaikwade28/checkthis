import * as os from "os";
import * as path from "path";

const APP_NAME = "checkthis";

function getHomeDir(): string {
  return os.homedir();
}

function getPlatformConfigDir(): string {
  const platform = os.platform();
  const home = getHomeDir();

  switch (platform) {
    case "win32":
      const localAppData =
        process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
      return path.join(localAppData, APP_NAME);
    case "darwin":
      return path.join(home, "Library", "Application Support", APP_NAME);
    default:
      // Linux and other Unix-like: follow XDG Base Directory Specification
      const xdgDataHome =
        process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share");
      return path.join(xdgDataHome, APP_NAME);
  }
}

export function getConfigDir(): string {
  return getPlatformConfigDir();
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function getModelDir(): string {
  return path.join(getConfigDir(), "models");
}

export function getModelPath(modelFileName: string): string {
  return path.join(getModelDir(), modelFileName);
}

export function getConfigDirForTesting(platform: string, homeDir: string): string {
  switch (platform) {
    case "win32": {
      const localAppData =
        process.env.LOCALAPPDATA ?? path.win32.join(homeDir, "AppData", "Local");
      return path.win32.join(localAppData, APP_NAME);
    }
    case "darwin":
      return path.posix.join(homeDir, "Library", "Application Support", APP_NAME);
    default: {
      const xdgDataHome =
        process.env.XDG_DATA_HOME ?? path.posix.join(homeDir, ".local", "share");
      return path.posix.join(xdgDataHome, APP_NAME);
    }
  }
}
