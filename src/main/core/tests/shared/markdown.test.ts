import { describe, it, expect } from 'vitest';
import { stripMarkdown } from '../../shared/markdown';

describe('stripMarkdown — empty input', () => {
  it('returns an empty string for an empty string', () => {
    expect(stripMarkdown('')).toBe('');
  });
});

describe('stripMarkdown — headers', () => {
  it('strips atx-style headers', () => {
    expect(stripMarkdown('# Heading one')).toBe('Heading one');
    expect(stripMarkdown('### Heading three')).toBe('Heading three');
  });

  it('strips closed atx-style headers', () => {
    expect(stripMarkdown('## Heading ##')).toBe('Heading');
  });

  it('strips setext-style H1 underlines (=)', () => {
    expect(stripMarkdown('Heading\n=======')).toBe('Heading\n');
  });

  it('strips setext-style H2 underlines (-) via the horizontal-rule rule', () => {
    // a bare run of 3+ dashes on its own line is indistinguishable from a
    // horizontal rule, and that rule (inherited as-is) runs first
    expect(stripMarkdown('Subheading\n----------')).toBe('Subheading\n');
  });
});

describe('stripMarkdown — emphasis', () => {
  it('strips bold text (** and __)', () => {
    expect(stripMarkdown('This is **bold**')).toBe('This is bold');
    expect(stripMarkdown('This is __bold__')).toBe('This is bold');
  });

  it('strips italic text (* and _)', () => {
    expect(stripMarkdown('This is *italic*')).toBe('This is italic');
    expect(stripMarkdown('This is _italic_')).toBe('This is italic');
  });

  it('strips strikethrough (~~ and ~)', () => {
    expect(stripMarkdown('This is ~~struck~~')).toBe('This is struck');
    expect(stripMarkdown('This is ~struck~')).toBe('This is struck');
  });

  it('leaves an underscore alone when not surrounded by whitespace/string edges', () => {
    // per the original package's semantics: _ only renders as emphasis when
    // flanked by whitespace or the start/end of the string
    expect(stripMarkdown('snake_case_identifier')).toBe('snake_case_identifier');
  });
});

describe('stripMarkdown — code', () => {
  it('strips inline code', () => {
    expect(stripMarkdown('Run `npm test` first')).toBe('Run npm test first');
  });

  it('strips fenced code blocks with backticks, trimming the code', () => {
    expect(stripMarkdown('```js\nconst x = 1;\n```')).toBe('const x = 1;');
  });

  it('strips fenced code blocks with tildes, including the closing fence', () => {
    expect(stripMarkdown('~~~\ncode line\n~~~')).toBe('code line');
  });

  it('strips a tilde-fenced code block with a language tag on the opening fence', () => {
    expect(stripMarkdown('~~~js\nconst x = 1;\n~~~')).toBe('const x = 1;');
  });
});

describe('stripMarkdown — blockquotes and horizontal rules', () => {
  it('strips blockquote markers', () => {
    expect(stripMarkdown('> A quoted line')).toBe('A quoted line');
  });

  it('strips horizontal rules', () => {
    expect(stripMarkdown('Above\n\n---\n\nBelow')).toBe('Above\n\nBelow');
  });
});

describe('stripMarkdown — lists', () => {
  it('strips unordered list leaders (-, *, +)', () => {
    expect(stripMarkdown('- one\n* two\n+ three')).toBe('one\ntwo\nthree');
  });

  it('strips ordered list leaders', () => {
    expect(stripMarkdown('1. one\n2. two')).toBe('one\ntwo');
  });

  it('leaves list content as-is when stripListLeaders is disabled', () => {
    expect(stripMarkdown('- one', { stripListLeaders: false })).toBe('- one');
  });

  it('replaces list leaders with a custom unicode character when given one', () => {
    expect(stripMarkdown('- one\n- two', { listUnicodeChar: '•' })).toBe('• one\n• two');
  });
});

describe('stripMarkdown — images and links', () => {
  it('keeps image alt text by default', () => {
    expect(stripMarkdown('![a diagram](https://example.com/img.png)')).toBe('a diagram');
  });

  it('drops images entirely when useImgAltText is false', () => {
    expect(
      stripMarkdown('![a diagram](https://example.com/img.png)', { useImgAltText: false }),
    ).toBe('');
  });

  it('replaces an inline link with its text by default', () => {
    expect(stripMarkdown('Check the [docs](https://example.com/docs) first')).toBe(
      'Check the docs first',
    );
  });

  it('replaces an inline link with its URL when replaceLinksWithURL is set', () => {
    expect(
      stripMarkdown('Check the [docs](https://example.com/docs) first', {
        replaceLinksWithURL: true,
      }),
    ).toBe('Check the https://example.com/docs first');
  });

  it('separates link text and URL when separateLinksAndTexts is set', () => {
    expect(
      stripMarkdown('See [docs](https://example.com/docs)', { separateLinksAndTexts: ' -> ' }),
    ).toBe('See docs -> https://example.com/docs');
  });

  it('keeps two independent links on separate lines separate', () => {
    const input = 'See [one](https://a.com)\n\nAnd also [two](https://b.com).';
    expect(stripMarkdown(input)).toBe('See one\n\nAnd also two.');
  });

  it('keeps two independent links on the same line separate', () => {
    expect(stripMarkdown('See [one](https://a.com) and also [two](https://b.com).')).toBe(
      'See one and also two.',
    );
  });
});

describe('stripMarkdown — HTML', () => {
  it('strips HTML tags', () => {
    expect(stripMarkdown('<div>Some <strong>text</strong></div>')).toBe('Some text');
  });

  it('leaves tags listed in htmlTagsToSkip', () => {
    expect(
      stripMarkdown('<div>Some <strong>text</strong></div>', { htmlTagsToSkip: ['strong'] }),
    ).toBe('Some <strong>text</strong>');
  });
});

describe('stripMarkdown — error handling', () => {
  it('falls back to the original input if throwError is not set and something goes wrong', () => {
    // options is intentionally malformed to force an exception inside the try block
    const malformed = { htmlTagsToSkip: null } as unknown as { htmlTagsToSkip: string[] };
    expect(stripMarkdown('<div>text</div>', malformed)).toBe('<div>text</div>');
  });

  it('rethrows when throwError is set', () => {
    const malformed = { htmlTagsToSkip: null } as unknown as { htmlTagsToSkip: string[] };
    expect(() => stripMarkdown('<div>text</div>', { ...malformed, throwError: true })).toThrow();
  });
});

describe('stripMarkdown — GFM task lists', () => {
  it('strips an unchecked task list item down to its text', () => {
    expect(stripMarkdown('- [ ] Write the docs')).toBe('Write the docs');
  });

  it('strips a checked task list item down to its text (lowercase x)', () => {
    expect(stripMarkdown('- [x] Write the docs')).toBe('Write the docs');
  });

  it('strips a checked task list item down to its text (uppercase X)', () => {
    expect(stripMarkdown('- [X] Write the docs')).toBe('Write the docs');
  });

  it('strips task list items using *, +, and ordered markers', () => {
    expect(stripMarkdown('* [ ] one\n+ [x] two\n1. [ ] three')).toBe('one\ntwo\nthree');
  });

  it('strips a run of consecutive task list items, each on its own line', () => {
    const input = '- [x] Write unit tests\n- [ ] Update docs\n- [ ] Add error handling';
    expect(stripMarkdown(input)).toBe('Write unit tests\nUpdate docs\nAdd error handling');
  });

  it('leaves an indented task list item correctly stripped (keeps indentation)', () => {
    expect(stripMarkdown('  - [ ] nested item')).toBe('  nested item');
  });

  it('does not touch task list syntax when gfm is disabled', () => {
    // task lists are a GFM extension — with gfm:false the checkbox is left
    // exactly as remove-markdown would have left it (bullet stripped, brackets not)
    expect(stripMarkdown('- [x] done', { gfm: false })).toBe('[x] done');
  });

  it('does not treat "[ ]"/"[x]" mid-sentence (not at a list position) as a task item', () => {
    // only strips the checkbox when it's a list leader; the literal text
    // elsewhere in a line is left alone
    expect(stripMarkdown('The array is [ ] empty here')).toBe('The array is [ ] empty here');
  });

  it('regression: a checklist followed by a real link does not corrupt either', () => {
    // this is the exact shape of content the seed script's task notes
    // generate, and the exact case that broke with the original package
    const input =
      '### Implementation notes\n\n' +
      '- [x] Write unit tests\n' +
      '- [ ] Update docs\n' +
      '- [ ] Add error handling\n\n' +
      'Some **bold** text and a [link](https://example.com).';

    expect(stripMarkdown(input)).toBe(
      'Implementation notes\n\n' +
        'Write unit tests\n' +
        'Update docs\n' +
        'Add error handling\n\n' +
        'Some bold text and a link.',
    );
  });

  it('regression: an unrelated unmatched bracket does not swallow a later real link', () => {
    // generalizes the fix beyond task lists: any stray "[...]" with nothing
    // recognizable after it used to be able to eat everything up to the
    // next real link
    const input = 'Note [draft] for later.\n\nSee [real link](https://example.com) here.';
    expect(stripMarkdown(input)).toBe('Note [draft] for later.\n\nSee real link here.');
  });
});
