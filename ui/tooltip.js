// tooltip.js — the on-demand claim tooltip (hover / keyboard focus / Escape).

const tooltipContainer = document.createElement('div');
tooltipContainer.id = 'tooltip-container';
document.body.appendChild(tooltipContainer);

export function showTooltip(element, text) {
  tooltipContainer.textContent = text;
  tooltipContainer.classList.add('show');
  const rect = element.getBoundingClientRect();
  const tip = tooltipContainer.getBoundingClientRect();
  const margin = 8;

  // Anchor to the key's left edge so the tip never drifts off the left side;
  // clamp within the popup bounds (flip left near the right edge).
  let left = rect.left;
  const maxLeft = window.innerWidth - tip.width - margin;
  if (left > maxLeft) left = maxLeft;
  if (left < margin) left = margin;

  // Prefer just below the row (keeps the value being read uncovered);
  // flip above only if it would clip the bottom edge.
  let top = rect.bottom + margin;
  if (top + tip.height > window.innerHeight - margin) {
    const above = rect.top - tip.height - margin;
    top = above >= margin ? above : Math.max(margin, window.innerHeight - tip.height - margin);
  }

  tooltipContainer.style.left = left + 'px';
  tooltipContainer.style.top = top + 'px';
}

export function hideTooltip() { tooltipContainer.classList.remove('show'); }

export function setupTooltips(root = document) {
  root.querySelectorAll('.tooltip[data-tooltip]').forEach(el => {
    if (el.dataset.tipBound) return;
    el.dataset.tipBound = 'true';
    const reveal = () => {
      const text = el.getAttribute('data-tooltip');
      if (text) showTooltip(el, text);
    };
    el.addEventListener('mouseenter', reveal);
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('focus', reveal);   // keyboard focus + tap-to-reveal
    el.addEventListener('blur', hideTooltip);
  });
}

// Escape dismisses an open tooltip (and drops focus from the trigger).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  hideTooltip();
  const el = document.activeElement;
  if (el && el.classList && el.classList.contains('tooltip')) el.blur();
});
