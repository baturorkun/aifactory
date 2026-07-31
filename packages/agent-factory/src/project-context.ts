import { dirname, isAbsolute, resolve } from 'node:path';

export function resolveTargetProjectPath(
  factoryRepositoryDirectory: string,
  invocationDirectory: string,
  selector: string,
): string {
  if (isAbsolute(selector)) return resolve(selector);
  if (selector.includes('/') || selector.includes('\\') || selector === '.' || selector === '..') {
    return resolve(invocationDirectory, selector);
  }
  return resolve(dirname(factoryRepositoryDirectory), selector);
}
