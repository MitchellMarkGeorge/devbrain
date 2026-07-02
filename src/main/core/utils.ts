import fs from 'node:fs';
import path from 'node:path';
import { settingsFileSchema } from './settings/schema';

export type DevBrainValidationResult = { valid: true } | { valid: false; errors: string[] };

function isDirectory(targetPath: string): boolean {
  return fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
}

/**
 * Validates that `rootPath` follows the DevBrain root directory structure:
 *   settings.json, logs/, workspaces/ — with settings.json checked against
 * the expected shape via zod. Does not validate individual workspace
 * directories (db.sqlite, notes/, etc).
 */
export function validateDevBrainPath(rootPath: string): DevBrainValidationResult {
  const errors: string[] = [];

  if (!isDirectory(rootPath)) {
    return { valid: false, errors: [`"${rootPath}" is not a directory`] };
  }

  const settingsPath = path.join(rootPath, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    errors.push(`missing settings.json at "${settingsPath}"`);
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      errors.push(`settings.json at "${settingsPath}" is not valid JSON`);
    }

    if (parsed !== undefined) {
      const result = settingsFileSchema.safeParse(parsed);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const location = issue.path.length > 0 ? issue.path.join('.') : '(root)';
          errors.push(`settings.json: ${location} - ${issue.message}`);
        }
      }
    }
  }

  const workspaceFolderPath = path.join(rootPath, 'workspaces');

  if (!isDirectory(workspaceFolderPath)) {
    errors.push(`missing workspaces/ directory in "${rootPath}"`);
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}
