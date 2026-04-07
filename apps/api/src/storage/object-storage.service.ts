import { Injectable } from "@nestjs/common";
import { constants } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

@Injectable()
export class ObjectStorageService {
  private readonly baseDir = process.env.LOCAL_STORAGE_DIR ?? ".local-storage";

  async putObject(key: string, buffer: Buffer) {
    const fullPath = join(process.cwd(), this.baseDir, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return {
      key,
      path: fullPath,
    };
  }

  async getObject(key: string) {
    const fullPath = join(process.cwd(), this.baseDir, key);
    return readFile(fullPath);
  }

  async checkHealth() {
    const healthPath = join(process.cwd(), this.baseDir, ".healthcheck");
    try {
      await mkdir(dirname(healthPath), { recursive: true });
      await writeFile(healthPath, "ok");
      await access(healthPath, constants.R_OK | constants.W_OK);
      await rm(healthPath, { force: true });
      return "up" as const;
    } catch {
      return "down" as const;
    }
  }
}
