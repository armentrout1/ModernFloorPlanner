export type AccountUiCommand =
  | { type: 'open' }
  | { type: 'settings' }
  | { type: 'sign-in' }
  | { type: 'sign-out' }
  | { type: 'new-workspace' }
  | { type: 'switch-workspace'; workspaceId: string };

export const ACCOUNT_UI_EVENT = 'mfp-account-ui';

export function sendAccountUiCommand(command: AccountUiCommand) {
  window.dispatchEvent(new CustomEvent<AccountUiCommand>(ACCOUNT_UI_EVENT, { detail: command }));
}
