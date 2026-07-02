import React from 'react';
import { Family, Member } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { UsersRound, User, Crown, Phone } from 'lucide-react';

interface FamilyViewDialogProps {
  family: Family | null;
  members: Member[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FamilyViewDialog: React.FC<FamilyViewDialogProps> = ({
  family,
  members,
  open,
  onOpenChange,
}) => {
  const familyMembers = family ? members.filter(m => family.members.includes(m.id)) : [];
  const headMember = family ? members.find(m => m.id === family.headMemberId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <UsersRound className="w-5 h-5 text-primary" />
            Family Details
          </DialogTitle>
        </DialogHeader>
        
        {!family ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">No family selected</p>
          </div>
        ) : (

        <div className="space-y-6">
          {/* Family Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{family.name}</h2>
              <p className="text-muted-foreground text-sm">
                {familyMembers.length} member{familyMembers.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* Family Head */}
          {headMember && (
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Crown className="w-4 h-4 text-primary" />
                Family Head
              </h3>
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{headMember.name}</p>
                    <p className="text-sm text-muted-foreground font-mono">{headMember.memberId}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    {headMember.phone}
                  </div>
                </div>
              </div>
            </div>
          )}

          <Separator className="bg-border/50" />

          {/* Family Members */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <UsersRound className="w-4 h-4 text-primary" />
              All Family Members ({familyMembers.length})
            </h3>
            <div className="space-y-3">
              {familyMembers.map(member => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{member.name}</p>
                      {member.id === family.headMemberId && (
                        <Badge variant="outline" className="text-xs bg-primary/10">
                          Head
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground capitalize">
                      {member.familyRole || 'Member'} • {member.phone}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">
                    {member.memberId}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
