// copy.js — click-to-copy claim values + copy-with-feedback buttons.

export function setupCopyableValues(root = document) {
  root.querySelectorAll('.copyable[data-copy-value]').forEach(el => {
    if (el.dataset.copySetup) return;
    el.dataset.copySetup = 'true';

    const linkIcon = el.querySelector('.url-link-icon');
    if (linkIcon) {
      linkIcon.addEventListener('click', e => {
        e.stopPropagation();
        const url = el.getAttribute('data-url');
        if (url) window.open(url, '_blank');
      });
    }

    el.addEventListener('click', async e => {
      if (e.target.classList.contains('url-link-icon')) return;
      e.stopPropagation();
      const value = el.getAttribute('data-copy-value');
      if (value === null) return;
      try {
        await navigator.clipboard.writeText(value);
        el.classList.add('copied');
        setTimeout(() => el.classList.remove('copied'), 1000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    });
  });
}

// ── Copy with visual feedback on a button ───────────────────────────────────
export async function copyWithFeedback(text, btn, doneLabel = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const original = btn.innerHTML;
      btn.innerHTML = doneLabel;
      btn.classList.add('copied');
      clearTimeout(btn._resetTimer);
      btn._resetTimer = setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.remove('copied');
      }, 1500);
    }
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}
