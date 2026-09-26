import { describe, expect, it } from 'vitest';
import { scrambleText } from '../../src/scene/reveal';

describe('heading decode', () => {
  const heading = "Let's talk.";

  it('resolves the text from left to right', () => {
    expect(scrambleText(heading, 1)).toBe(heading);
    const half = scrambleText(heading, 0.5, () => 0);
    expect(half.slice(0, 6)).toBe(heading.slice(0, 6));
    expect(half.slice(6)).not.toBe(heading.slice(6));
  });

  it('keeps the length and the spaces, so the line breaks stay put', () => {
    const scrambled = scrambleText('Things I built.', 0, () => 0.5);
    expect(scrambled).toHaveLength('Things I built.'.length);
    expect(scrambled[6]).toBe(' ');
    expect(scrambled[8]).toBe(' ');
    expect(scrambled.replace(/ /g, '')).not.toMatch(/[a-z]/);
  });
});
