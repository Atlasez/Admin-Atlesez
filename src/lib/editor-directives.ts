import {
  isArticleDirectiveClose,
  parseArticleDirectiveMarker,
} from "./article-directives.mjs";

export type DirectiveMarker = {
  fence: string;
  name: string;
  title: string;
};

export function parseDirectiveMarker(value: string): DirectiveMarker | null {
  return parseArticleDirectiveMarker(value) as DirectiveMarker | null;
}

export function isDirectiveClose(value: string, minimumLength = 3): boolean {
  return isArticleDirectiveClose(value, minimumLength);
}
