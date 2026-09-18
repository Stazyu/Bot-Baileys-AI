import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pickBestYoutubeMatch,
  scoreCandidate,
  type YoutubeSearchCandidate,
} from '../src/utils/youtubeSearch.js';

/** Search results as yt-dlp returns them, in YouTube's relevance order. */
const candidate = (
  title: string,
  uploader: string,
  duration: number,
  id = title.slice(0, 8),
): YoutubeSearchCandidate => ({
  id,
  title,
  uploader,
  duration,
  viewCount: 1000,
  url: `https://www.youtube.com/watch?v=${id}`,
});

// Real candidate list for "Reagge Terlena" (typo included on purpose).
const TERLENA_RESULTS: YoutubeSearchCandidate[] = [
  candidate('Ikke Nurjanah - TERLENA | Cover Reggae Version', 'Jahrani Flow', 267, 'cover1'),
  candidate('KUMPULAN DANGDUT REGGAE TEMAN KERJA DAN NGOPI - TERLENA | PUTRI PANGGUNG', 'Cover Lagu FYP', 5228, 'kumpulan'),
  candidate('Reggae ska Terlena - Ikke Nurjanah | SEMBARANIA', 'SEMBARANIA', 436, 'reggae1'),
  candidate('TERLENA "JI RO LU PAT" - KALIA SISKA feat SKA 86', 'UYE tone', 400, 'kentrung'),
];

test('picks the requested song despite a typo in the query', () => {
  const { best, confidence } = pickBestYoutubeMatch('Reagge Terlena', TERLENA_RESULTS);

  assert.equal(best?.id, 'reggae1');
  assert.equal(confidence, 'high');
});

test('penalizes a cover version the user did not ask for', () => {
  const cover = TERLENA_RESULTS[0];
  const ranked = scoreCandidate('Reagge Terlena', cover, 1, TERLENA_RESULTS.length);

  assert.ok(ranked.penalties.includes('cover'));
  assert.ok(ranked.score < ranked.coverage);
});

test('honors an explicit cover request instead of penalizing it', () => {
  const { best } = pickBestYoutubeMatch('terlena cover reggae', TERLENA_RESULTS);

  assert.equal(best?.id, 'cover1');
});

test('prefers a single track over a long compilation', () => {
  const { best, alternates } = pickBestYoutubeMatch('reggae terlena', TERLENA_RESULTS);
  const compilation = alternates.find((entry) => entry.id === 'kumpulan');

  assert.equal(best?.id, 'reggae1');
  assert.ok(compilation?.penalties.includes('compilation'));
  assert.ok(compilation?.penalties.includes('too-long'));
});

test('reports no match for an unrelated query so the caller can ask the user', () => {
  const { best, confidence } = pickBestYoutubeMatch('xzqw vbnm lkjh', TERLENA_RESULTS);

  assert.equal(confidence, 'none');
  assert.ok((best?.score ?? 1) < 0.35);
  assert.ok(best !== null, 'candidates are still returned for the user to choose from');
});

test('downloads an odd but exact title', () => {
  const results = [
    candidate('REGEDUT TERLENA FEAT MADE RASTA', 'Kkul Keyla TV', 274, 'regedut'),
    candidate('Dangdut TERLENA - 2 Boys', 'The Rich Mindset', 254, 'dangdut'),
  ];
  const { best, confidence } = pickBestYoutubeMatch('Regedut Terlena feat Made Rasta', results);

  assert.equal(best?.id, 'regedut');
  assert.equal(confidence, 'high');
});
