import {
  bend,
  createBar,
  createBeat,
  createDuration,
  createNote,
  createRest,
  createScore,
  createTimeSignature,
  createTrack,
  createVoice,
  EIGHTH,
  FOUR_FOUR,
  HALF,
  harmonic,
  plainArticulation,
  QUARTER,
  SIXTEENTH,
  slide,
  WHOLE,
  type Articulation,
  type Note,
  type Score,
} from '@tabkit/core';

function n(string: number, fret: number, ...articulations: Articulation[]): Note {
  return createNote(string, fret, { articulations });
}

const pm = () => plainArticulation('palmMute');
const h = () => plainArticulation('hammerOn');
const p = () => plainArticulation('pullOff');
const lr = () => plainArticulation('letRing');
const vib = () => plainArticulation('vibrato');

/** A short palm-muted E5 riff with a hammer-on and a bend. */
export function demoScore(): Score {
  const bar1 = createBar(FOUR_FOUR, [
    createVoice([
      createBeat(EIGHTH, [n(5, 0, pm()), n(4, 2, pm())]),
      createBeat(EIGHTH, [n(5, 0, pm()), n(4, 2, pm())]),
      createBeat(EIGHTH, [n(5, 0, pm()), n(4, 2, pm())]),
      createBeat(EIGHTH, [n(5, 3, h())]),
      createBeat(EIGHTH, [n(5, 5)]),
      createBeat(EIGHTH, [n(5, 0, pm()), n(4, 2, pm())]),
      createBeat(QUARTER, [n(2, 2, bend(1))]),
    ]),
  ]);
  const bar2 = createBar(FOUR_FOUR, [
    createVoice([
      createBeat(EIGHTH, [n(5, 0, pm()), n(4, 2, pm())]),
      createBeat(EIGHTH, [n(5, 0, pm()), n(4, 2, pm())]),
      createBeat(QUARTER, [n(3, 2, slide('shift'))]),
      createBeat(QUARTER, [n(3, 4, vib())]),
      createBeat(QUARTER, [n(5, 0), n(4, 2), n(3, 2)]),
    ]),
  ]);
  return createScore({
    title: 'Demo Riff',
    composer: 'TabKit',
    tempo: 132,
    tracks: [createTrack({ bars: [bar1, bar2] })],
  });
}

/**
 * An 8-bar fixture exercising every note value, a time-signature change,
 * chords, rests, and every articulation with parameters — used to eyeball the
 * renderer and playback.
 */
export function showcaseScore(): Score {
  const dottedQuarter = createDuration(4, { dots: 1 });
  const bars = [
    // 1: note values long → short
    createBar(FOUR_FOUR, [
      createVoice([createBeat(HALF, [n(2, 5)]), createBeat(QUARTER, [n(2, 7)]), createBeat(EIGHTH, [n(2, 5)]), createBeat(EIGHTH, [n(2, 3)])]),
    ]),
    // 2: sixteenths, a dotted quarter and rests
    createBar(FOUR_FOUR, [
      createVoice([
        createBeat(SIXTEENTH, [n(1, 5)]),
        createBeat(SIXTEENTH, [n(1, 7)]),
        createBeat(SIXTEENTH, [n(1, 8)]),
        createBeat(SIXTEENTH, [n(1, 7)]),
        createBeat(dottedQuarter, [n(1, 5, vib())]),
        createRest(EIGHTH),
        createBeat(QUARTER, [n(5, 0), n(4, 2), n(3, 2), n(2, 1), n(1, 0), n(0, 0)]),
      ]),
    ]),
    // 3: 3/4 — hammer-ons, pull-offs, legato slide
    createBar(createTimeSignature(3, 4), [
      createVoice([
        createBeat(QUARTER, [n(2, 5, h())]),
        createBeat(QUARTER, [n(2, 7, p())]),
        createBeat(QUARTER, [n(2, 5, slide('legato'))]),
      ]),
    ]),
    // 4: 3/4 — the legato target, then bends
    createBar(createTimeSignature(3, 4), [
      createVoice([
        createBeat(QUARTER, [n(2, 9, bend(0.5))]),
        createBeat(QUARTER, [n(1, 8, bend(1))]),
        createBeat(QUARTER, [n(1, 10, bend(1.5))]),
      ]),
    ]),
    // 5: back to 4/4 — slide zoo
    createBar(FOUR_FOUR, [
      createVoice([
        createBeat(QUARTER, [n(3, 5, slide('shift'))]),
        createBeat(QUARTER, [n(3, 9, slide('outDown'))]),
        createBeat(QUARTER, [n(2, 7, slide('inBelow'))]),
        createBeat(QUARTER, [n(2, 7, slide('outUp'))]),
      ]),
    ]),
    // 6: attack + muting
    createBar(FOUR_FOUR, [
      createVoice([
        createBeat(QUARTER, [n(4, 7, plainArticulation('tap'))]),
        createBeat(QUARTER, [n(5, 5, plainArticulation('slap'))]),
        createBeat(QUARTER, [n(4, 7, plainArticulation('pop'))]),
        createBeat(QUARTER, [n(5, 0, plainArticulation('dead'))]),
      ]),
    ]),
    // 7: harmonics
    createBar(FOUR_FOUR, [
      createVoice([
        createBeat(QUARTER, [n(3, 12, harmonic('natural'))]),
        createBeat(QUARTER, [n(3, 5, harmonic('artificial'))]),
        createBeat(QUARTER, [n(2, 7, harmonic('pinch'))]),
        createBeat(QUARTER, [n(2, 12, harmonic('tap'))]),
      ]),
    ]),
    // 8: let it ring out
    createBar(FOUR_FOUR, [
      createVoice([createBeat(WHOLE, [n(5, 0, lr()), n(4, 2, lr()), n(3, 2, lr()), n(2, 0, lr())])]),
    ]),
  ];
  return createScore({
    title: 'Feature Showcase',
    subtitle: 'every value, signature, chord and technique',
    composer: 'TabKit',
    tempo: 96,
    tracks: [createTrack({ bars })],
  });
}

/** The fingerpicked Em intro — let-ring arpeggios with descending pull-offs. */
export function nothingElseMatters(): Score {
  const arpeggio = () =>
    createVoice([
      createBeat(EIGHTH, [n(5, 0, lr())]),
      createBeat(EIGHTH, [n(3, 0, lr())]),
      createBeat(EIGHTH, [n(2, 0, lr())]),
      createBeat(EIGHTH, [n(1, 0, lr())]),
      createBeat(EIGHTH, [n(2, 0, lr())]),
      createBeat(EIGHTH, [n(3, 0, lr())]),
      createBeat(EIGHTH, [n(2, 0, lr())]),
      createBeat(EIGHTH, [n(1, 0, lr())]),
    ]);
  const descending = createVoice([
    createBeat(QUARTER, [n(5, 0, lr())]),
    createBeat(EIGHTH, [n(0, 7, p())]),
    createBeat(EIGHTH, [n(0, 5, p())]),
    createBeat(EIGHTH, [n(0, 3, p())]),
    createBeat(EIGHTH, [n(0, 2)]),
    createBeat(QUARTER, [n(0, 0, lr()), n(1, 0, lr())]),
  ]);
  const resolve = createVoice([
    createBeat(WHOLE, [n(5, 0, lr()), n(3, 0, lr()), n(2, 0, lr()), n(1, 0, lr()), n(0, 0, lr())]),
  ]);
  return createScore({
    title: 'Nothing Else Matters',
    subtitle: 'intro (excerpt)',
    composer: 'Metallica',
    tempo: 92,
    tracks: [
      createTrack({
        bars: [
          createBar(FOUR_FOUR, [arpeggio()]),
          createBar(FOUR_FOUR, [arpeggio()]),
          createBar(FOUR_FOUR, [descending]),
          createBar(FOUR_FOUR, [resolve]),
        ],
      }),
    ],
  });
}
