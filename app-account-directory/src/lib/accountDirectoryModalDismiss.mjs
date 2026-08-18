/**
 * Overlay dismiss for Account Directory write modals.
 *
 * A click event can fire on the backdrop when a text-selection drag starts
 * inside an input and the pointer is released on the overlay. Closing must
 * require the pointer to start AND end on the backdrop.
 */

/**
 * @param {{ pointerDownOnBackdrop?: boolean, clickOnBackdrop?: boolean }} opts
 */
export function shouldDismissModalOnBackdropClick(opts = {}) {
  return Boolean(opts.pointerDownOnBackdrop) && Boolean(opts.clickOnBackdrop);
}
