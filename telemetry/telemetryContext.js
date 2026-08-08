function detectBrowser(userAgent = '') {
  const ua = String(userAgent);
  const edge = ua.match(/Edg\/(\d+)/i);
  if (edge) return { browser: 'edge', browserMajor: Number(edge[1]) };
  const chrome = ua.match(/(?:Chrome|CriOS)\/(\d+)/i);
  if (chrome) return { browser: 'chrome', browserMajor: Number(chrome[1]) };
  return { browser: 'chromium', browserMajor: null };
}

function detectOs(userAgent = '', platform = '') {
  const value = `${userAgent} ${platform}`.toLowerCase();
  if (value.includes('android')) return 'android';
  if (value.includes('cros')) return 'chromeos';
  if (value.includes('windows') || value.includes('win32') || value.includes('win64')) return 'windows';
  if (value.includes('mac os') || value.includes('macintosh') || value.includes('macintel')) return 'macos';
  if (value.includes('linux')) return 'linux';
  return 'other';
}

function installationAgeBucket(installationDate, now) {
  const installedAt = Date.parse(installationDate || '');
  if (!Number.isFinite(installedAt)) return 'unknown';
  const days = Math.max(0, (now - installedAt) / (24 * 60 * 60 * 1000));
  if (days < 7) return 'lt_7d';
  if (days < 30) return '7_30d';
  if (days < 90) return '31_90d';
  return '90d_plus';
}

export function buildTelemetryContext({
  manifest,
  navigatorRef = {},
  locale = 'en',
  isPro = false,
  isLegacyUser = false,
  installationDate = null,
  now = Date.now()
}) {
  const userAgent = navigatorRef.userAgent || '';
  const platformValue = navigatorRef.platform || '';
  const browser = detectBrowser(userAgent);
  const isMobile = navigatorRef.userAgentData?.mobile === true || /Android|Mobile/i.test(userAgent);

  return {
    extensionVersion: String(manifest?.version || 'unknown'),
    browser: browser.browser,
    browserMajor: browser.browserMajor,
    platform: isMobile ? 'mobile' : 'desktop',
    os: detectOs(userAgent, platformValue),
    locale: String(locale || 'en').replace('_', '-').toLowerCase().slice(0, 16),
    access: isPro ? 'pro' : (isLegacyUser ? 'legacy' : 'free'),
    installationAge: installationAgeBucket(installationDate, now)
  };
}
