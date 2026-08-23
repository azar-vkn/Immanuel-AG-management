import React from 'react';
import { Member } from '@/types';
import { Cake, Gift, MapPin, Users, UsersRound } from 'lucide-react';
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

/** Build a short address string from the member's address fields. */
const getShortAddress = (member: Member): string | null => {
  const parts: string[] = [];
  if (member.address?.place) parts.push(member.address.place);
  if (member.address?.city) parts.push(member.address.city);
  return parts.length > 0 ? parts.join(', ') : null;
};

/** Resolve the family head name for a member. */
const getFamilyHeadName = (member: Member, allMembers: Member[]): string | null => {
  if (member.isHeadOfFamily) return member.name; // they ARE the head
  if (!member.familyId) return null;
  const head = allMembers.find(m => m.isHeadOfFamily && m.familyId === member.familyId);
  return head ? head.name : null;
};

interface BirthdayCardProps {
  members: Member[];
  type: 'birthday' | 'anniversary';
  allMembers?: Member[]; // Full member list to resolve family head names
}

export const BirthdayCard: React.FC<BirthdayCardProps> = ({ members, type, allMembers = [] }) => {
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
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {members.map((member) => {
            const date = type === 'birthday' ? member.dob : member.anniversaryDate;
            const shortAddress = getShortAddress(member);
            const familyHead = getFamilyHeadName(member, allMembers);
            const fellowship = member.fellowship || null;

            return (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-foreground">{member.name}</p>
                  {member.phone && (
                    <p className="text-xs text-muted-foreground">{member.phone}</p>
                  )}
                  {/* Additional info row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                    {shortAddress && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[140px]">{shortAddress}</span>
                      </span>
                    )}
                    {familyHead && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[120px]">{familyHead}</span>
                      </span>
                    )}
                    {fellowship && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <UsersRound className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[140px]">{fellowship}</span>
                      </span>
                    )}
                  </div>
                </div>
                {date && safeFormatDate(date, 'MMM dd') && (
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary flex-shrink-0 ml-2">
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
