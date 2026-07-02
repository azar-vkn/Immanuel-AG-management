import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User } from 'lucide-react';

interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables: string[];
  maxLength?: number;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  value,
  onChange,
  variables,
  maxLength = 1024,
}) => {
  const insertVariable = (variable: string) => {
    const placeholder = `{{${variable}}}`;
    onChange(value + placeholder);
  };

  const charCount = value.length;
  const isOverLimit = charCount > maxLength;

  return (
    <div className="space-y-3">
      {/* Variable Insertion Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Insert Variable:</span>
        {variables.map((variable) => (
          <Button
            key={variable}
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 bg-primary/5 border-primary/20 hover:bg-primary/10"
            onClick={() => insertVariable(variable)}
          >
            <User className="w-3 h-3" />
            {`{{${variable}}}`}
          </Button>
        ))}
      </div>

      {/* Editor */}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[200px] bg-secondary/30 border-border/50 font-mono text-sm leading-relaxed resize-y"
        placeholder="Enter your message template here..."
        dir="auto"
      />

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {variables.map((v) => {
            const count = (value.match(new RegExp(`\\{\\{${v}\\}\\}`, 'gi')) || []).length;
            return (
              <Badge
                key={v}
                variant="outline"
                className={count > 0 ? 'badge-success text-xs' : 'text-xs opacity-50'}
              >
                {`{{${v}}}`}: {count}x
              </Badge>
            );
          })}
        </div>
        <span className={`text-xs ${isOverLimit ? 'text-red-400' : 'text-muted-foreground'}`}>
          {charCount}/{maxLength}
        </span>
      </div>
    </div>
  );
};
