import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  collapsed?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ collapsed = false }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size={collapsed ? "icon" : "default"}
      onClick={toggleTheme}
      className={cn(
        'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all',
        collapsed ? 'justify-center' : 'justify-start gap-3 w-full'
      )}
    >
      {theme === 'dark' ? (
        <>
          <Sun className="w-5 h-5" />
          {!collapsed && <span>Light Mode</span>}
        </>
      ) : (
        <>
          <Moon className="w-5 h-5" />
          {!collapsed && <span>Dark Mode</span>}
        </>
      )}
    </Button>
  );
};
