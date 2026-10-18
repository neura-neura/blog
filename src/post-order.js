const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
export function compareArticles(a, b, order = 'newest') {
  if (order === 'title') return collator.compare(a.title || '', b.title || '');
  const dateA = Date.parse(a.publishedAt) || 0;
  const dateB = Date.parse(b.publishedAt) || 0;
  return order === 'oldest' ? dateA - dateB : dateB - dateA;
}
