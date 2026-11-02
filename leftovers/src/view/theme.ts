/**
 * Which set the battle is dressed in. The picnic (toys against ants round a birthday cake) is the
 * default; `?theme=scifi` is the in-engine sample of the sci-fi bug swarm (docs/art/scifi_r1): a hover
 * rail-tank on a magnetic ring round a reactor, on pale blue frost, against dark purple bugs.
 * Only the look changes; the sim is the same.
 */
export const SCIFI = typeof location !== 'undefined' && new URLSearchParams(location.search).get('theme') === 'scifi';

// The UI skin follows (style.css, `.scifi`): navy glass panels with cyan edges instead of the stickers.
if (SCIFI) document.documentElement.classList.add('scifi');
