import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { CrossIcon } from '@/components/CrossIcon';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { SidebarClock } from '@/components/layout/SidebarClock';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Calendar,
  ClipboardCheck,
  FileBarChart,
  UsersRound,
  Phone,
  LogOut,
  ChevronLeft,
  Menu,
  MapPinned,
  Zap,
  ScanFace
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard.view' },
  { path: '/members', icon: Users, label: 'Members', permission: 'members.view' },
  { path: '/families', icon: UsersRound, label: 'Families', permission: 'families.view' },
  { path: '/events', icon: Calendar, label: 'Events', permission: 'events.view' },
  { path: '/attendance', icon: ClipboardCheck, label: 'Attendance', permission: 'attendance.view' },
  { path: '/attendance/live', icon: ScanFace, label: 'Face Configuration', permission: 'attendance.live.view' },
  { path: '/reports', icon: FileBarChart, label: 'Reports', permission: 'reports.view' },
  { path: '/follow-up', icon: Phone, label: 'Follow-Up', permission: 'followup.view' },
  { path: '/teams', icon: MapPinned, label: 'Teams', permission: 'teams.manage' },
  { path: '/automations', icon: Zap, label: 'Automations', permission: 'automations.view' },
];

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const visibleItems = navItems.filter(item => hasPermission(item.permission));

  // Two-letter monogram, so the footer shows who is signed in without a photo.
  const initials = (user?.name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border z-50',
        'flex flex-col transition-all duration-300 ease-in-out',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3 overflow-hidden">
          <CrossIcon size="sm" glow />
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-serif text-sm font-semibold text-gold-gradient truncate">
                Immanuel AG
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                Church Management
              </span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn(
            'ml-auto text-muted-foreground hover:text-foreground hover:bg-sidebar-accent',
            collapsed && 'mx-auto'
          )}
        >
          {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 overflow-y-auto scrollbar-slim">
        <ul className="space-y-0.5">
          {visibleItems.map((item) => (
            <li key={item.path}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) => cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap overflow-hidden',
                      'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                      isActive && 'bg-sidebar-accent text-sidebar-primary font-medium',
                      collapsed && 'justify-center'
                    )}
                  >
                    <item.icon className={cn('w-[18px] h-[18px] flex-shrink-0', collapsed && 'w-5 h-5')} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="font-medium">
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer: identity, clock, theme and sign-out condensed into two rows
          instead of four stacked blocks — that height is what pushed the nav
          into its own scrollbar. */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <ThemeToggle collapsed />
            <SidebarClock collapsed />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                {user ? `${user.name} · Sign Out` : 'Sign Out'}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            {user && (
              <div className="flex items-center gap-2.5 px-1 min-w-0">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-primary">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {user.role.replace('_', ' ')}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 px-1">
              <SidebarClock collapsed={false} variant="inline" />
              <div className="flex flex-shrink-0 items-center">
                <ThemeToggle collapsed />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleLogout}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <LogOut className="w-[18px] h-[18px]" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="font-medium">
                    Sign Out
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </>
        )}
      </div>

    </aside>
  );
};
