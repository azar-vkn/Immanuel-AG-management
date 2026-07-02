import React, { useState, useEffect } from 'react';
import { Family, Member } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UsersRound, User, Search } from 'lucide-react';
import { toast } from 'sonner';

interface FamilyEditDialogProps {
  family: Family | null;
  allMembers: Member[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (family: Family) => void;
}

export const FamilyEditDialog: React.FC<FamilyEditDialogProps> = ({
  family,
  allMembers,
  open,
  onOpenChange,
  onSave,
}) => {
  const [familyName, setFamilyName] = useState('');
  const [headMemberId, setHeadMemberId] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (family) {
      setFamilyName(family.name);
      setHeadMemberId(family.headMemberId);
      setSelectedMembers(family.members);
    }
  }, [family]);

  if (!family) return null;

  const filteredMembers = allMembers.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.memberId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleSave = () => {
    if (!familyName.trim()) {
      toast.error('Family name is required');
      return;
    }
    if (!headMemberId) {
      toast.error('Please select a family head');
      return;
    }
    if (selectedMembers.length === 0) {
      toast.error('Please select at least one family member');
      return;
    }
    if (!selectedMembers.includes(headMemberId)) {
      toast.error('Family head must be a member of the family');
      return;
    }

    onSave({
      ...family,
      name: familyName,
      headMemberId,
      members: selectedMembers,
    });
    toast.success('Family updated successfully');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <UsersRound className="w-5 h-5 text-primary" />
            Edit Family
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Family Name */}
          <div className="space-y-2">
            <Label htmlFor="familyName">Family Name *</Label>
            <Input
              id="familyName"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Enter family name"
              className="bg-secondary/50"
            />
          </div>

          {/* Family Head Selection */}
          <div className="space-y-2">
            <Label>Family Head *</Label>
            <Select value={headMemberId} onValueChange={setHeadMemberId}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue placeholder="Select family head" />
              </SelectTrigger>
              <SelectContent>
                {selectedMembers.map(memberId => {
                  const member = allMembers.find(m => m.id === memberId);
                  if (!member) return null;
                  return (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} ({member.memberId})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Member Selection */}
          <div className="space-y-3">
            <Label>Family Members ({selectedMembers.length} selected)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary/50"
              />
            </div>
            <ScrollArea className="h-64 rounded-lg border border-border/50 bg-secondary/20">
              <div className="p-2 space-y-1">
                {filteredMembers.map(member => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => toggleMember(member.id)}
                  >
                    <Checkbox
                      checked={selectedMembers.includes(member.id)}
                      onCheckedChange={() => toggleMember(member.id)}
                    />
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{member.memberId}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{member.phone}</span>
                  </div>
                ))}
                {filteredMembers.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">No members found</p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-primary hover:bg-primary/90">
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
