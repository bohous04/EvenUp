let lockCount = 0;

/**
 * Reference-counted body scroll lock shared by all stacked dialogs (Sheet,
 * Modal). Per-instance save/restore breaks when two dialogs close in one
 * commit — the second cleanup restores the first dialog's 'hidden'.
 */
export function lockBodyScroll(): () => void {
  lockCount += 1;
  if (lockCount === 1) document.body.style.overflow = 'hidden';
  return () => {
    lockCount -= 1;
    if (lockCount === 0) document.body.style.overflow = '';
  };
}
