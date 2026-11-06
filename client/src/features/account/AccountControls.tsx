import { useSyncExternalStore } from 'react';
import { Building2, Check, ChevronDown, LogIn, LogOut, Plus, Settings, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { accountStore } from './runtime';
import { sendAccountUiCommand } from './accountUi';

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
}

export default function AccountControls() {
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.getSnapshot);
  const { session } = account;
  const authenticated = session.status === 'authenticated' && Boolean(session.principal);
  const currentWorkspace = session.workspace;
  const displayName = currentWorkspace?.name || session.principal?.displayName || 'Account';

  return (
    <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
      {authenticated && currentWorkspace ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="min-w-0 max-w-[12rem] gap-2 px-2" aria-label={`Workspace: ${currentWorkspace.name}`}>
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="hidden truncate sm:inline">{currentWorkspace.name}</span>
              <ChevronDown className="hidden h-4 w-4 shrink-0 text-slate-500 sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {session.workspaces.map(workspace => (
              <DropdownMenuItem
                key={workspace.id}
                disabled={account.checking}
                onSelect={() => workspace.id !== currentWorkspace.id && sendAccountUiCommand({ type: 'switch-workspace', workspaceId: workspace.id })}
              >
                {workspace.id === currentWorkspace.id ? <Check /> : <Building2 />}
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                <span className="text-xs capitalize text-slate-500">{workspace.role}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => sendAccountUiCommand({ type: 'new-workspace' })}>
              <Plus /> New workspace
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => sendAccountUiCommand({ type: 'settings' })}>
              <Settings /> Workspace settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button variant="ghost" className="gap-2 px-2" aria-label="Guest" onClick={() => sendAccountUiCommand({ type: 'sign-in' })}>
          <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">Guest</span>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" aria-label="Account">
            <Avatar className="h-9 w-9 border border-slate-200">
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                {authenticated ? initials(displayName) : <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="min-w-0">
            <span className="block truncate">{authenticated ? displayName : 'Guest session'}</span>
            <span className="block text-xs font-normal text-slate-500">{authenticated ? 'Signed in' : 'Saved in this browser only'}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {authenticated ? <>
            <DropdownMenuItem onSelect={() => sendAccountUiCommand({ type: 'settings' })}>
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => sendAccountUiCommand({ type: 'sign-out' })}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </> : <DropdownMenuItem onSelect={() => sendAccountUiCommand({ type: 'sign-in' })}>
            <LogIn /> Sign in or create account
          </DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
