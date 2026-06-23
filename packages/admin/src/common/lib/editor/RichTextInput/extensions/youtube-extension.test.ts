import { describe, it, expect } from 'vitest';
import { getEmbedUrl, YoutubeEmbed } from './youtube-extension';

describe('getEmbedUrl', () => {
  it('returns null for empty input', () => {
    expect(getEmbedUrl('')).toBeNull();
  });

  it('extracts the 11-char id from a youtube.com/watch?v= URL', () => {
    expect(getEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('extracts the 11-char id from a short youtu.be URL', () => {
    expect(getEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('extracts the 11-char id from an already-embed URL', () => {
    expect(getEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('ignores trailing query params after the id', () => {
    expect(getEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=10s')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });
});

describe('YoutubeEmbed node config', () => {
  it('declares the expected name, group, and atom flag', () => {
    expect(YoutubeEmbed.name).toBe('youtubeEmbed');
    // `config` is preserved on the Node instance and carries our declared options
    const cfg = YoutubeEmbed.config as { group?: string; atom?: boolean };
    expect(cfg.group).toBe('block');
    expect(cfg.atom).toBe(true);
  });
});
