export function readingStats(text = '', wordsPerMinute = 220) {
  const words = [...new Intl.Segmenter('es', { granularity: 'word' }).segment(String(text))]
    .filter(part => part.isWordLike).length;
  return { words, minutes: words ? Math.ceil(words / wordsPerMinute) : 0 };
}
