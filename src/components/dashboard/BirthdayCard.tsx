import React from 'react';
import { Member } from '@/types';
import { Cake, Gift } from 'lucide-react';
import { format, isValid } from 'date-fns';

const safeFormatDate = (dateValue: string | { seconds: number } | null | undefined, fmt: string): string | null => {
  if (!dateValue) return null;
  try {
    let d: Date;
    if (typeof dateValue === 'object' && 'seconds' in dateValue) {
      d = new Date(dateValue.seconds * 1000);
    } else {
      d = new Date(dateValue);
    }
    return isValid(d) ? format(d, fmt) : null;
  } catch {
    return null;
  }
};

interface BirthdayCardProps {
  members: Member[];
  type: 'birthday' | 'anniversary';
}

export const BirthdayCard: React.FC<BirthdayCardProps> = ({ members, type }) => {
  const Icon = type === 'birthday' ? Cake : Gift;
  const title = type === 'birthday' ? 'Birthdays Today' : 'Anniversaries Today';
  const emptyMessage = type === 'birthday' 
    ? 'No birthdays today' 
    : 'No anniversaries today';

  return (
    <div className="glass rounded-xl p-6 card-hover animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>

      {members.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      ) : (
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {members.map((member) => {
            const date = type === 'birthday' ? member.dob : member.anniversaryDate;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div>
                  <p className="font-medium text-sm text-foreground">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.phone}</p>
                </div>
                {date && safeFormatDate(date, 'MMM dd') && (
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                    {safeFormatDate(date, 'MMM dd')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
