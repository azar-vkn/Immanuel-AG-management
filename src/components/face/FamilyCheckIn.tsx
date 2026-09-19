import React from 'react';
import { Member } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Baby, UserPlus, X, Info } from 'lucide-react';

export interface FamilyGroup {
  familyId: string;
  /** Who was recognised, prompting this family to appear. */
  seenName: string;
  /** Family members still to mark — already-present ones are left out. */
  members: Member[];
}

interface FamilyCheckInProps {
  groups: FamilyGroup[];
  /** Why the latest person recognised has nobody to offer, when that's the case. */
  note?: string | null;
  isChild: (member: Member) => boolean;
  onMark: (member: Member) => void;
  onDismiss: (familyId: string) => void;
  onClearAll: () => void;
  /**
   * Keep the panel on screen when empty. As a dedicated column beside the
   * camera it should hold its place rather than appear and vanish, which would
   * shift the layout every time someone is recognised.
   */
  alwaysVisible?: boolean;
  /** Cap the list's height; beyond it the list scrolls inside the panel. */
  maxHeightVh?: number;
}

/**
 * "Also here?" — when a parent's face is recognised, their unmarked family
 * members appear as one-tap buttons.
 *
 * Built for young children, who are hard to detect: they are short, move
 * unpredictably, and their faces change too quickly for a registered template
 * to stay reliable. Instead of trying to see them, it relies on the operator,
 * who can see who actually walked in with the parent. Nothing is marked
 * without a tap, so children who stayed home are never counted.
 */
export const FamilyCheckIn: React.FC<FamilyCheckInProps> = ({
  groups,
  note,
  isChild,
  onMark,
  onDismiss,
  onClearAll,
  alwaysVisible = false,
  maxHeightVh,
}) => {
  const isEmpty = groups.length === 0 && !note;
  if (isEmpty && !alwaysVisible) return null;

  return (
    <div
      className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3 overflow-y-auto"
      style={maxHeightVh ? { maxHeight: `${maxHeightVh}vh` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" />
          Also here? Tap anyone who came in with them
        </p>
        {!isEmpty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-7 px-2 text-xs"
          >
            Clear all
          </Button>
        )}
      </div>

      {isEmpty && (
        <p className="text-xs text-muted-foreground py-6 text-center">
          When someone is recognised, the rest of their family appears here to tap.
        </p>
      )}

      {note && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          {note}
        </p>
      )}

      <div className="space-y-2.5">
        {groups.map((group) => (
          <div
            key={group.familyId}
            className="rounded-md border border-border/50 bg-background/60 p-2.5 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                With <span className="font-medium text-foreground">{group.seenName}</span>
              </p>
              <button
                type="button"
                onClick={() => onDismiss(group.familyId)}
                className="text-muted-foreground hover:text-foreground"
                title="Dismiss this family"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {group.members.map((member) => {
                const child = isChild(member);
                return (
                  <Button
                    key={member.id}
                    type="button"
                    size="sm"
                    variant={child ? 'default' : 'outline'}
                    onClick={() => onMark(member)}
                    className="h-8 gap-1.5"
                    title={`Mark ${member.name} present (${member.memberId})`}
                  >
                    {child && <Baby className="w-3.5 h-3.5" />}
                    {member.name}
                    {child && (
                      <Badge
                        variant="secondary"
                        className="ml-0.5 h-4 px-1 text-[10px] leading-none"
                      >
                        Child
                      </Badge>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FamilyCheckIn;
