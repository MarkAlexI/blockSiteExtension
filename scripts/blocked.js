const closeBtn = document.getElementById('closeBtn');
const blockedReason = document.getElementById('blockedReason');

const reasonMessageKeys = Object.freeze({
  always: 'blocking_mode_always',
  schedule: 'rule_scheduled',
  daily_limit: 'daily_limit_reached',
  focus: 'focussessionheader'
});

try {
  const reason = new URL(window.location.href).searchParams.get('reason');
  const messageKey = reasonMessageKeys[reason];
  if (blockedReason && messageKey) {
    blockedReason.setAttribute('data-i18n', messageKey);
  }
} catch {
  // Keep the generic localized message for incomplete or malformed URLs.
}

closeBtn.addEventListener('click', () => window.close());
