import React, { useState, useEffect, useMemo } from 'react';
import { getMembers } from '@/services/firestore';
import { Member } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UsersRound, Eye, User, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { MemberViewDialog } from '@/components/members/MemberViewDialog';
import { toast } from 'sonner';

interface FamilyGroup {
  familyId: string;
  head: Member | null;
  members: Member[];
  memberCount: number;
}

const Families: React.FC = () => {
  const { hasPermission } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  // Fetch members from Firestore
  useEffect(() => {
    const fetchData = async () => {
      try {
        const membersData = await getMembers();
        setMembers(membersData);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load families');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Derive families from members collection
  const families: FamilyGroup[] = useMemo(() => {
    const familyMap = new Map<string, Member[]>();
    
    members.forEach(member => {
      // Skip members without a familyId
      if (!member.familyId) return;
      
      if (!familyMap.has(member.familyId)) {
        familyMap.set(member.familyId, []);
      }
      familyMap.get(member.familyId)!.push(member);
    });
    
    // Convert to array, filter out single-member "families" (individuals), and sort
    return Array.from(familyMap.entries())
      .filter(([, familyMembers]) => familyMembers.length > 1)
      .map(([familyId, familyMembers]) => {
        // Sort: head first, then by memberId
        familyMembers.sort((a, b) => {
          if (a.isHeadOfFamily && !b.isHeadOfFamily) return -1;
          if (!a.isHeadOfFamily && b.isHeadOfFamily) return 1;
          return a.memberId.localeCompare(b.memberId, undefined, { numeric: true });
        });
        
        // Head is: member with isHeadOfFamily flag, or member whose memberId matches familyId (no dash suffix)
        const head = familyMembers.find(m => m.isHeadOfFamily) 
          || familyMembers.find(m => m.memberId === familyId)
          || familyMembers[0] 
          || null;
        
        return {
          familyId,
          head,
          members: familyMembers,
          memberCount: familyMembers.length
        };
      })
      .sort((a, b) => (a.head?.memberId || '').localeCompare(b.head?.memberId || '', undefined, { numeric: true }));
  }, [members]);

  const toggleFamilyExpansion = (familyId: string) => {
    setExpandedFamilies(prev => {
      const next = new Set(prev);
      if (next.has(familyId)) {
        next.delete(familyId);
      } else {
        next.add(familyId);
      }
      return next;
    });
  };

  const handleViewMember = (member: Member) => {
    if (!member) {
      toast.error('Member data not available');
      return;
    }
    setSelectedMember(member);
    setShowViewDialog(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="font-serif text-3xl font-bold text-gold-gradient">Families</h1>
        <p className="text-muted-foreground">View and manage church families ({families.length} families, {members.length} members)</p>
      </div>

      {/* Families Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {families.map((family, index) => {
          const isExpanded = expandedFamilies.has(family.familyId);

          return (
            <div
              key={family.familyId}
              className="glass rounded-xl p-6 card-hover animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <UsersRound className="w-6 h-6" />
                </div>
                <Badge variant="outline" className="text-xs">
                  {family.familyId}
                </Badge>
              </div>

              {/* Family Head Info */}
              {family.head && (
                <div className="mb-4">
                  <h3 className="font-semibold text-lg text-foreground">{family.head.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Head of Family • <span className="text-primary">{family.head.memberId}</span>
                  </p>
                </div>
              )}

              {/* Member Count & Expand Toggle */}
              <div 
                className="flex items-center justify-between cursor-pointer p-2 rounded-lg hover:bg-secondary/30 -mx-2 mb-2"
                onClick={() => toggleFamilyExpansion(family.familyId)}
              >
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Family Members ({family.memberCount})
                </p>
                {family.memberCount > 1 && (
                  isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )
                )}
              </div>

              {/* Members List */}
              <div className="space-y-2">
                {(isExpanded ? family.members : family.members.slice(0, 1)).map(member => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 cursor-pointer hover:bg-secondary/50"
                    onClick={() => handleViewMember(member)}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {member.relationship || (member.isHeadOfFamily ? 'Head' : 'Member')}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {member.memberId}
                    </Badge>
                  </div>
                ))}
                {!isExpanded && family.memberCount > 1 && (
                  <p 
                    className="text-xs text-primary text-center py-1 cursor-pointer hover:underline"
                    onClick={() => toggleFamilyExpansion(family.familyId)}
                  >
                    +{family.memberCount - 1} more members
                  </p>
                )}
              </div>

              {/* View All Button */}
              {family.head && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-4 gap-2"
                  onClick={() => handleViewMember(family.head!)}
                >
                  <Eye className="w-4 h-4" />
                  View Family Head
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {families.length === 0 && (
        <div className="glass rounded-xl p-12 text-center">
          <UsersRound className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No families registered yet.</p>
        </div>
      )}

      {/* View Member Dialog */}
      <MemberViewDialog
        member={selectedMember}
        open={showViewDialog}
        onOpenChange={setShowViewDialog}
      />
    </div>
  );
};

export default Families;