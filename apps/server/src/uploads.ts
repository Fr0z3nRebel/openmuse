import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { type Config, defaultUploadsLimitBytes } from "./config.ts";
import { AppError } from "./errors.ts";

export interface UploadedFileInfo {
  name: string;
  path: string;
  size: number;
  uploadedAt: string;
}

export interface UploadsStatus {
  files: UploadedFileInfo[];
  usageBytes: number;
  limitBytes: number;
  warning: boolean;
}

export interface UploadResult extends UploadsStatus {
  file: UploadedFileInfo;
}

/** Fraction of the uploads limit at which the user is warned to clear space soon. */
const warningRatio = 0.75;

function sanitizeFileName(name: string): string {
  const cleaned = basename(name)
    .replace(/[^\p{L}\p{N}._\- ]/gu, "_")
    .replace(/^[. ]+/, "")
    .slice(0, 120);
  return cleaned || "file";
}

function formatLimit(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  return Number.isInteger(gib) ? `${gib} GB` : `${Math.round(bytes / 1000 ** 2)} MB`;
}

/**
 * Files the user attaches in chat, stored as plain files under <dataDir>/uploads so
 * tools that take a local file path can use them. Every operation stays inside that
 * folder: uploads are copies, and cleanup never touches the user's original files.
 */
export class UploadsService {
  readonly dir: string;
  private readonly limitBytes: number;

  constructor(config: Config) {
    this.dir = resolve(config.dataDir ?? ".openmuse", "uploads");
    this.limitBytes = config.uploadsLimitBytes ?? defaultUploadsLimitBytes;
  }

  async status(): Promise<UploadsStatus> {
    const files = await this.listFiles();
    const usageBytes = files.reduce((total, file) => total + file.size, 0);
    return {
      files,
      usageBytes,
      limitBytes: this.limitBytes,
      warning: usageBytes >= this.limitBytes * warningRatio,
    };
  }

  async save(name: string, bytes: Uint8Array): Promise<UploadResult> {
    const current = await this.status();
    if (current.usageBytes + bytes.length > this.limitBytes)
      throw new AppError(
        `Uploads are full: this file would exceed the ${formatLimit(this.limitBytes)} limit. Delete uploads in Settings to make room.`,
        413,
      );
    await mkdir(this.dir, { recursive: true });
    const storedName = await this.availableName(sanitizeFileName(name));
    const path = join(this.dir, storedName);
    await writeFile(path, bytes);
    const info = await stat(path);
    const file: UploadedFileInfo = {
      name: storedName,
      path,
      size: info.size,
      uploadedAt: info.mtime.toISOString(),
    };
    return { file, ...(await this.status()) };
  }

  async remove(name: string): Promise<UploadsStatus> {
    await rm(this.pathInside(name), { force: true });
    return this.status();
  }

  async clear(): Promise<UploadsStatus> {
    await rm(this.dir, { recursive: true, force: true });
    return this.status();
  }

  private async listFiles(): Promise<UploadedFileInfo[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const files: UploadedFileInfo[] = [];
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const info = await stat(join(this.dir, name)).catch(() => undefined);
      if (info?.isFile())
        files.push({
          name,
          path: join(this.dir, name),
          size: info.size,
          uploadedAt: info.mtime.toISOString(),
        });
    }
    return files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  private async availableName(name: string): Promise<string> {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    for (let attempt = 1; ; attempt++) {
      const candidate = attempt === 1 ? name : `${stem} (${attempt})${extension}`;
      const existing = await stat(join(this.dir, candidate)).catch(() => undefined);
      if (!existing) return candidate;
    }
  }

  /** Resolve a user-supplied name to a path that must stay inside the uploads folder. */
  private pathInside(name: string): string {
    const path = resolve(this.dir, basename(name));
    if (path !== this.dir && !path.startsWith(this.dir + sep))
      throw new AppError("Invalid upload name", 400);
    return path;
  }
}
