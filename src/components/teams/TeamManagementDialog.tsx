import React, { useState, useEffect } from 'react';
import { Team } from '@/types/team';
import { getMembers } from '@/services/firestore';
import { Member } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Settings, Plus, Trash2, Users, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

interface TeamManagementDialogProps {
  teams: Team[];
  onTeamsChange: (teams: Team[]) => void;
}

export const TeamManagementDialog: React.FC<TeamManagementDialogProps> = ({
  teams,
  onTeamsChange,
}) => {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [selectedLeader, setSelectedLeader] = useState<string>('');

  // Fetch members when dialog opens
  useEffect(() => {
    if (open) {
      const fetchMembers = async () => {
        try {
          const data = await getMembers();
          setMembers(data);
        } catch (error) {
          console.error('Error fetching members:', error);
        }
      };
      fetchMembers();
    }
  }, [open]);

  const handleAddTeam = () => {
    if (!newTeamName.trim()) {
      toast.error('Please enter a team name');
      return;
    }

    if (teams.some(t => t.name.toLowerCase() === newTeamName.toLowerCase())) {
      toast.error('A team with this name already exists');
      return;
    }

    const newTeam: Team = {
      id: `T${Date.now()}`,
      name: newTeamName.trim(),
      leaders: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onTeamsChange([...teams, newTeam]);
    setNewTeamName('');
    toast.success(`Team "${newTeam.name}" created successfully`);
  };

  const handleDeleteTeam = (teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    const membersInTeam = members.filter(m => m.team === team.name);
    if (membersInTeam.length > 0) {
      toast.error(`Cannot delete team with ${membersInTeam.length} member(s) assigned`);
      return;
    }

    onTeamsChange(teams.filter(t => t.id !== teamId));
    toast.success(`Team "${team.name}" deleted`);
  };

  const handleRenameTeam = (teamId: string, newName: string) => {
    if (!newName.trim()) return;

    onTeamsChange(teams.map(t => 
      t.id === teamId 
        ? { ...t, name: newName.trim(), updatedAt: new Date().toISOString() }
        : t
    ));
    setEditingTeam(null);
    toast.success('Team renamed successfully');
  };

  const handleAddLeader = (teamId: string) => {
    if (!selectedLeader) return;

    onTeamsChange(teams.map(t => 
      t.id === teamId 
        ? { 
            ...t, 
            leaders: [...t.leaders, selectedLeader],
            updatedAt: new Date().toISOString() 
          }
        : t
    ));
    setSelectedLeader('');
    toast.success('Leader assigned successfully');
  };

  const handleRemoveLeader = (teamId: string, leaderId: string) => {
    onTeamsChange(teams.map(t => 
      t.id === teamId 
        ? { 
            ...t, 
            leaders: t.leaders.filter(l => l !== leaderId),
            updatedAt: new Date().toISOString() 
          }
        : t
    ));
    toast.success('Leader removed');
  };

  const getMemberName = (memberId: string) => {
    return members.find(m => m.id === memberId)?.name || 'Unknown';
  };

  const availableLeaders = members.filter(m => 
    m.churchRole === 'volunteer' || m.churchRole === 'host' || m.churchRole === 'operator'
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-primary/30 hover:border-primary">
          <Settings className="w-4 h-4" />
          Manage Teams
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-gold-gradient flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Team Management
          </DialogTitle>
          <DialogDescription>
            Create, rename, delete teams and assign team leaders
          </DialogDescription>
        </DialogHeader>

        {/* Add New Team */}
        <div className="flex gap-2 mt-4">
          <Input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Enter new team name..."
            className="bg-secondary/50"
            onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
          />
          <Button onClick={handleAddTeam} className="gap-2 bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4" />
            Add Team
          </Button>
        </div>

        {/* Teams List */}
        <div className="space-y-4 mt-6">
          {teams.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No teams created yet. Add your first team above.
            </div>
          ) : (
            teams.map((team) => {
              const memberCount = members.filter(m => m.team === team.name).length;
              
              return (
                <div key={team.id} className="glass rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    {editingTeam?.id === team.id ? (
                      <Input
                        defaultValue={team.name}
                        className="max-w-xs bg-secondary/50"
                        autoFocus
                        onBlur={(e) => handleRenameTeam(team.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleRenameTeam(team.id, (e.target as HTMLInputElement).value);
                          } else if (e.key === 'Escape') {
                            setEditingTeam(null);
                          }
                        }}
                      />
                    ) : (
                      <div className="flex items-center gap-3">
                        <h4 
                          className="font-semibold text-lg cursor-pointer hover:text-primary transition-colors"
                          onClick={() => setEditingTeam(team)}
                        >
                          {team.name}
                        </h4>
                        <Badge variant="secondary" className="text-xs">
                          {memberCount} member{memberCount !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteTeam(team.id)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      disabled={memberCount > 0}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Team Leaders */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Team Leaders</Label>
                    <div className="flex flex-wrap gap-2">
                      {team.leaders.length === 0 ? (
                        <span className="text-sm text-muted-foreground italic">No leaders assigned</span>
                      ) : (
                        team.leaders.map((leaderId) => (
                          <Badge 
                            key={leaderId} 
                            variant="outline" 
                            className="gap-1 pr-1 border-primary/30"
                          >
                            {getMemberName(leaderId)}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 p-0 hover:bg-destructive/20"
                              onClick={() => handleRemoveLeader(team.id, leaderId)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </Badge>
                        ))
                      )}
                    </div>
                    
                    {/* Add Leader */}
                    <div className="flex gap-2 mt-2">
                      <Select value={selectedLeader} onValueChange={setSelectedLeader}>
                        <SelectTrigger className="bg-secondary/50 max-w-xs">
                          <SelectValue placeholder="Select a leader..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableLeaders
                            .filter(m => !team.leaders.includes(m.id))
                            .map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {member.name} ({member.churchRole})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleAddLeader(team.id)}
                        disabled={!selectedLeader}
                        className="border-primary/30 hover:border-primary"
                      >
                        <UserPlus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
