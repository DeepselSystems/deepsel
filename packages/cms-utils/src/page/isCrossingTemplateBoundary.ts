import { parseSlug } from './parseSlug.js';

export const isCrossingTemplateBoundary = (fromPath: string, toPath: string) => {
  const fromPathType = parseSlug(fromPath).pathType;
  const toPathType = parseSlug(toPath).pathType;
  return fromPathType !== toPathType;
};
