/** All document-level editor shortcuts share the same focus/ownership guard. */
export function shouldIgnoreEditorShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, button, [role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="alertdialog"], [role="menu"]')) return true;
  return Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], dialog[open]'));
}
