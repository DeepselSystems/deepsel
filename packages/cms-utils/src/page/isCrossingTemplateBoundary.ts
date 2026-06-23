import { getPathType } from './getPathType.js';

export const isCrossingTemplateBoundary = (fromPath: string, toPath: string) => {
  const fromPathType = getPathType(fromPath).pathType;
  const toPathType = getPathType(toPath).pathType;
  return fromPathType !== toPathType;
};
