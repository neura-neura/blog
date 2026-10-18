const paths = {
  crop: 'M6 3v12a3 3 0 0 0 3 3h12M3 6h12a3 3 0 0 1 3 3v12',
  original: 'M4 5h16v14H4Z', wide: 'M3 8h18v8H3Z', square: 'M4 4h16v16H4Z',
  zoomIn: 'M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0M7 10h6M10 7v6',
  zoomOut: 'M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0M7 10h6',
  camera: 'M14 5l-1-2H7L6 5H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3M16 11a4 4 0 1 1-8 0 4 4 0 0 1 8 0M19 1v6M16 4h6',
  close: 'M6 6l12 12M6 18 18 6', back: 'M19 12H5m6-6-6 6 6 6',
};
export const mediaIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.crop}"></path></svg>`;
