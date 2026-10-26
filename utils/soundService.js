import { createSoundGate, SOUND_TIMEOUT_MS } from './soundPlayer.js';

export const OFFSCREEN_SOUND_PATH = 'scripts/sound-offscreen.html';
export const OFFSCREEN_SOUND_TARGET = 'sound-offscreen';

export function createSoundService({ api, clients = globalThis.clients, now = Date.now, ...gateOptions }) {
  async function findDocuments() {
    if (api.runtime.getContexts) {
      return (await api.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }))
        .map(context => context.documentUrl);
    }
    // Chrome 109-115: exact URL matching, never mistake Options for offscreen.
    if (!clients?.matchAll) throw new Error('Offscreen discovery is unavailable');
    return (await clients.matchAll({ includeUncontrolled: true })).map(client => client.url);
  }

  const play = createSoundGate(async (sound, requestId, isCurrent) => {
    if (!api.offscreen?.createDocument || !api.offscreen?.closeDocument) {
      return { success: false, code: 'audio_unavailable' };
    }
    const url = api.runtime.getURL(OFFSCREEN_SOUND_PATH);
    let owned = false;
    const expiresAt = now() + SOUND_TIMEOUT_MS;
    try {
      const documents = await findDocuments();
      owned = documents.includes(url);
      if (!await isCurrent()) return { success: false, code: 'audio_cancelled' };
      if (!owned) {
        await api.offscreen.createDocument({
          url: OFFSCREEN_SOUND_PATH,
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'Play the user-enabled Focus completion sound or its preview.'
        });
      }
      owned = true;
      if (!await isCurrent() || now() >= expiresAt) return { success: false, code: 'audio_cancelled' };
      return await api.runtime.sendMessage({
        target: OFFSCREEN_SOUND_TARGET,
        type: 'sound:play', sound, requestId, expiresAt
      });
    } finally {
      // Only close our sound page. Other future offscreen features own theirs.
      if (owned) await api.offscreen.closeDocument();
    }
  }, gateOptions);
  return { play };
}
