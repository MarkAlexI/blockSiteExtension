import { createSoundGate, isSupportedSound, playFocusChime } from '../utils/soundPlayer.js';
import { OFFSCREEN_SOUND_TARGET } from '../utils/soundService.js';

const play = createSoundGate((_sound, _requestId, isCurrent) => playFocusChime({ canPlay: isCurrent }));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== OFFSCREEN_SOUND_TARGET || message.type !== 'sound:play') return false;
  if (sender.id !== chrome.runtime.id || sender.tab || !isSupportedSound(message.sound) ||
      !Number.isFinite(message.expiresAt) || Date.now() >= message.expiresAt) {
    sendResponse({ success: false, code: 'invalid_sound' });
    return false;
  }
  play(message.sound, message.requestId, () => Date.now() < message.expiresAt).then(sendResponse);
  return true;
});
