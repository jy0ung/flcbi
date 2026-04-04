import { Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
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
}
