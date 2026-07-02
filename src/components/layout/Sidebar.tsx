import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { CrossIcon } from '@/components/CrossIcon';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { cn } from '@/lib/utils';
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
  Zap
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
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {visibleItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                  'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                  isActive && 'bg-sidebar-accent text-sidebar-primary font-medium',
                  collapsed && 'justify-center'
                )}
              >
                <item.icon className={cn('w-5 h-5 flex-shrink-0', collapsed && 'w-6 h-6')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Theme Toggle & User Info & Logout */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        {/* Theme Toggle */}
        <ThemeToggle collapsed={collapsed} />
        
        {!collapsed && user && (
          <div className="px-3 py-2 rounded-lg bg-sidebar-accent/50">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{user.role.replace('_', ' ')}</p>
          </div>
        )}
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            'w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10',
            collapsed && 'justify-center'
          )}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && 'Sign Out'}
        </Button>
      </div>
    </aside>
  );
};
