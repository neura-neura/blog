import test from 'node:test';
import assert from 'node:assert/strict';
import { imageMarkdown } from '../src/body-image.js';

test('body image Markdown keeps caption and ALT safely without private crop originals', () => {
  const html = imageMarkdown({ src: 'https://example.test/crop.webp', alt: 'A "view" & sky', caption: '<Landscape> & details\nSecond line', originalSrc: 'private-original', crop: '{"zoom":2}' });
  assert.match(html, /alt="A &quot;view&quot; &amp; sky"/);
  assert.match(html, /<figcaption>&lt;Landscape&gt; &amp; details\nSecond line<\/figcaption>/);
  assert.doesNotMatch(html, /private-original|zoom|data-image-crop/);
});

test('an optional empty caption adds no visible figcaption', () => {
  assert.equal(imageMarkdown({ src: '/image.png' }), '<figure data-body-image="true"><img src="/image.png" alt=""></figure>');
});
