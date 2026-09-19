import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ThemeToggleProps {
  collapsed?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ collapsed = false }) => {
  const { theme, toggleTheme } = useTheme();

  const label = theme === 'dark' ? 'Light Mode' : 'Dark Mode';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={toggleTheme}
          className={cn(
            'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all whitespace-nowrap overflow-hidden',
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
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right" className="font-medium">
          {label}
        </TooltipContent>
      )}
    </Tooltip>
  );
};
