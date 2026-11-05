// Read-only browser layout observation. Playwright's stable-element check does
// not cover a stationary button clipped by its ancestor's max-height animation.
export function readProPanelReadiness() {
  const panel = document.getElementById('proWrapper');
  return {
    open: panel?.classList.contains('open') ?? false,
    inert: panel?.inert ?? true,
    fullyExpanded: Boolean(panel && panel.clientHeight >= panel.scrollHeight),
    animating: panel ? panel.getAnimations().some(animation =>
      animation.playState === 'running' || animation.pending) : false
  };
}
