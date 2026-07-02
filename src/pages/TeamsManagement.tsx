import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeams } from '@/contexts/TeamContext';
import { getMembers, updateMember, createTeamGroup, updateTeamGroup, deleteTeamGroup } from '@/services/firestore';
import { Member } from '@/types';
import { TeamGroupData, SubTeamData } from '@/types/team';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, MapPin, Users, ChevronDown, ChevronRight, Plus, Edit2, Trash2,
  Search, ShieldAlert, UserPlus, X, Crown, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

const TeamsManagement: React.FC = () => {
  const { hasPermission } = useAuth();
  const { teamGroups, loading: teamsLoading, refresh } = useTeams();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [editingTeamGroup, setEditingTeamGroup] = useState<TeamGroupData | null>(null);
  const [teamName, setTeamName] = useState('');

  const [showSubTeamDialog, setShowSubTeamDialog] = useState(false);
  const [parentTeamId, setParentTeamId] = useState('');
  const [editingSubTeamIdx, setEditingSubTeamIdx] = useState<number | null>(null);
  const [subTeamName, setSubTeamName] = useState('');
  const [subTeamAreas, setSubTeamAreas] = useState('');

  const [showLeaderDialog, setShowLeaderDialog] = useState(false);
  const [leaderTarget, setLeaderTarget] = useState<{ teamId: string; subTeamName?: string } | null>(null);
  const [leaderSearch, setLeaderSearch] = useState('');

  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ subTeamName: string } | null>(null);
  const [assignSearch, setAssignSearch] = useState('');

  if (!hasPermission('teams.manage')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <ShieldAlert className="w-16 h-16 text-destructive/50" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
      </div>
    );
  }

  useEffect(() => {
    getMembers().then(d => { setMembers(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (teamGroups.length > 0 && expandedTeams.size === 0) {
      setExpandedTeams(new Set(teamGroups.map(g => g.id)));
    }
  }, [teamGroups]);

  const teamStats = useMemo(() => {
    const s: Record<string, number> = {};
    members.forEach(m => { if (m.team) s[m.team] = (s[m.team] || 0) + 1; });
    return s;
  }, [members]);

  const unassignedCount = members.filter(m => !m.team || m.team === 'Unassigned').length;
  const getGroupCount = (g: TeamGroupData) => g.subTeams.reduce((n, st) => n + (teamStats[st.name] || 0), 0);
  const toggleTeam = (id: string) => {
    setExpandedTeams(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const getMemberName = (id: string) => members.find(m => m.id === id)?.name || id;
  const getSubMembers = (name: string) => {
    let f = members.filter(m => m.team === name);
    if (searchQuery) { const q = searchQuery.toLowerCase(); f = f.filter(m => m.name.toLowerCase().includes(q) || m.memberId.toLowerCase().includes(q)); }
    return f;
  };

  // ---- Team Group CRUD ----
  const openAddTeam = () => { setEditingTeamGroup(null); setTeamName(''); setShowTeamDialog(true); };
  const openEditTeam = (g: TeamGroupData) => { setEditingTeamGroup(g); setTeamName(g.name); setShowTeamDialog(true); };
  const saveTeamGroup = async () => {
    if (!teamName.trim()) return;
    try {
      if (editingTeamGroup) {
        await updateTeamGroup(editingTeamGroup.id, { name: teamName.trim() });
      } else {
        await createTeamGroup({ name: teamName.trim(), leaders: [], subTeams: [], createdAt: '', updatedAt: '' });
      }
      await refresh();
      setShowTeamDialog(false);
      toast.success(editingTeamGroup ? 'Team updated' : 'Team created');
    } catch { toast.error('Failed to save team'); }
  };
  const handleDeleteTeam = async (g: TeamGroupData) => {
    if (!confirm(`Delete "${g.name}" and all its sub-teams? Members will keep their sub-team value.`)) return;
    try { await deleteTeamGroup(g.id); await refresh(); toast.success('Team deleted'); } catch { toast.error('Failed'); }
  };

  // ---- Sub-Team CRUD ----
  const openAddSubTeam = (teamId: string) => { setParentTeamId(teamId); setEditingSubTeamIdx(null); setSubTeamName(''); setSubTeamAreas(''); setShowSubTeamDialog(true); };
  const openEditSubTeam = (teamId: string, idx: number, st: SubTeamData) => {
    setParentTeamId(teamId); setEditingSubTeamIdx(idx); setSubTeamName(st.name); setSubTeamAreas(st.areas.join(', ')); setShowSubTeamDialog(true);
  };
  const saveSubTeam = async () => {
    if (!subTeamName.trim()) return;
    const group = teamGroups.find(g => g.id === parentTeamId);
    if (!group) return;
    const areas = subTeamAreas.split(',').map(a => a.trim()).filter(Boolean);
    const newSt: SubTeamData = { name: subTeamName.trim(), areas, leaders: [] };
    let subs = [...group.subTeams];
    if (editingSubTeamIdx !== null) { newSt.leaders = subs[editingSubTeamIdx].leaders; subs[editingSubTeamIdx] = newSt; }
    else subs.push(newSt);
    try {
      await updateTeamGroup(parentTeamId, { subTeams: subs });
      await refresh(); setShowSubTeamDialog(false);
      toast.success(editingSubTeamIdx !== null ? 'Sub-team updated' : 'Sub-team created');
    } catch { toast.error('Failed'); }
  };
  const handleDeleteSubTeam = async (teamId: string, idx: number) => {
    const group = teamGroups.find(g => g.id === teamId);
    if (!group || !confirm(`Delete sub-team "${group.subTeams[idx].name}"?`)) return;
    const subs = group.subTeams.filter((_, i) => i !== idx);
    try { await updateTeamGroup(teamId, { subTeams: subs }); await refresh(); toast.success('Deleted'); } catch { toast.error('Failed'); }
  };

  // ---- Leaders ----
  const openLeaderDialog = (teamId: string, subTeamName?: string) => {
    setLeaderTarget({ teamId, subTeamName }); setLeaderSearch(''); setShowLeaderDialog(true);
  };
  const getCurrentLeaders = (): string[] => {
    if (!leaderTarget) return [];
    const g = teamGroups.find(t => t.id === leaderTarget.teamId);
    if (!g) return [];
    if (leaderTarget.subTeamName) return g.subTeams.find(s => s.name === leaderTarget.subTeamName)?.leaders || [];
    return g.leaders || [];
  };
  const toggleLeader = async (memberId: string) => {
    if (!leaderTarget) return;
    const g = teamGroups.find(t => t.id === leaderTarget.teamId);
    if (!g) return;
    try {
      if (leaderTarget.subTeamName) {
        const subs = g.subTeams.map(st => {
          if (st.name !== leaderTarget.subTeamName) return st;
          const leaders = st.leaders.includes(memberId) ? st.leaders.filter(l => l !== memberId) : [...st.leaders, memberId];
          return { ...st, leaders };
        });
        await updateTeamGroup(g.id, { subTeams: subs });
      } else {
        const leaders = g.leaders.includes(memberId) ? g.leaders.filter(l => l !== memberId) : [...g.leaders, memberId];
        await updateTeamGroup(g.id, { leaders });
      }
      await refresh();
    } catch { toast.error('Failed'); }
  };

  // ---- Assign Members ----
  const openAssignDialog = (subTeamName: string) => { setAssignTarget({ subTeamName }); setAssignSearch(''); setShowAssignDialog(true); };
  const toggleMemberAssign = async (member: Member) => {
    if (!assignTarget) return;
    const newTeam = member.team === assignTarget.subTeamName ? '' : assignTarget.subTeamName;
    try {
      await updateMember(member.id, { team: newTeam });
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, team: newTeam } : m));
    } catch { toast.error('Failed'); }
  };

  if (loading || teamsLoading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const filteredLeaderMembers = members.filter(m => {
    if (!leaderSearch) return true;
    const q = leaderSearch.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.memberId.toLowerCase().includes(q);
  }).slice(0, 50);

  const filteredAssignMembers = members.filter(m => {
    if (!assignSearch) return true;
    const q = assignSearch.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.memberId.toLowerCase().includes(q);
  }).slice(0, 80);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="font-serif text-3xl font-bold text-gold-gradient">Teams Management</h1>
          <p className="text-muted-foreground">Manage teams, sub-teams, leaders, and member assignments</p>
        </div>
        <Button onClick={openAddTeam} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add Team
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 animate-fade-in [animation-delay:100ms]">
        {teamGroups.map(g => (
          <div key={g.id} className="glass rounded-xl p-4 text-center">
            <p className="text-2xl font-bold">{getGroupCount(g)}</p>
            <p className="text-sm text-muted-foreground">{g.name}</p>
          </div>
        ))}
        <div className="glass rounded-xl p-4 text-center border-amber-500/30">
          <p className="text-2xl font-bold text-amber-400">{unassignedCount}</p>
          <p className="text-sm text-muted-foreground">Unassigned</p>
        </div>
      </div>

      {/* Search */}
      <div className="glass rounded-xl p-4 animate-fade-in [animation-delay:150ms]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input placeholder="Search members within teams..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 bg-secondary/50" />
        </div>
      </div>

      {/* Team Accordion */}
      <div className="space-y-4 animate-fade-in [animation-delay:200ms]">
        {teamGroups.map(group => {
          const isExp = expandedTeams.has(group.id);
          return (
            <div key={group.id} className="glass rounded-xl overflow-hidden">
              {/* Group Header */}
              <div className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors">
                <button onClick={() => toggleTeam(group.id)} className="flex items-center gap-3 flex-1 text-left">
                  {isExp ? <ChevronDown className="w-5 h-5 text-primary" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  <h2 className="font-serif text-lg font-semibold">{group.name}</h2>
                  <Badge variant="secondary" className="text-xs">{group.subTeams.length} sub-teams</Badge>
                  {group.leaders.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Crown className="w-3 h-3 text-amber-500" />
                      <span className="text-xs text-muted-foreground">{group.leaders.map(l => getMemberName(l)).join(', ')}</span>
                    </div>
                  )}
                </button>
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/10 text-primary border-primary/20"><Users className="w-3 h-3 mr-1" />{getGroupCount(group)}</Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openLeaderDialog(group.id)} title="Assign Leaders"><Crown className="w-4 h-4 text-amber-500" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openAddSubTeam(group.id)} title="Add Sub-Team"><Plus className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditTeam(group)} title="Edit"><Edit2 className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteTeam(group)} title="Delete"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>

              {/* Sub-teams */}
              {isExp && (
                <div className="border-t border-border/30">
                  {group.subTeams.map((st, idx) => {
                    const stMembers = getSubMembers(st.name);
                    return (
                      <div key={st.name} className="border-b border-border/20 last:border-b-0">
                        <div className="px-6 py-3 bg-secondary/20 flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge variant="outline" className="font-mono text-primary border-primary/30 bg-primary/5">{st.name}</Badge>
                            <div className="flex flex-wrap gap-1">
                              {st.areas.map(a => (
                                <Badge key={a} variant="secondary" className="text-[11px] bg-secondary/60">
                                  <MapPin className="w-3 h-3 mr-1 text-muted-foreground" />{a}
                                </Badge>
                              ))}
                            </div>
                            {st.leaders.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Crown className="w-3 h-3 text-amber-500" />
                                <span className="text-xs text-muted-foreground">{st.leaders.map(l => getMemberName(l)).join(', ')}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{teamStats[st.name] || 0}</Badge>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openLeaderDialog(group.id, st.name)} title="Leaders"><Crown className="w-3 h-3 text-amber-500" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAssignDialog(st.name)} title="Assign Members"><UserPlus className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSubTeam(group.id, idx, st)} title="Edit"><Edit2 className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteSubTeam(group.id, idx)} title="Delete"><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        </div>
                        {stMembers.length > 0 && (
                          <div className="px-6">
                            <Table>
                              <TableHeader><TableRow className="border-border/30 hover:bg-transparent">
                                <TableHead className="text-xs">Member ID</TableHead><TableHead className="text-xs">Name</TableHead><TableHead className="text-xs">Phone</TableHead><TableHead className="text-xs">Address</TableHead>
                              </TableRow></TableHeader>
                              <TableBody>
                                {stMembers.map(m => (
                                  <TableRow key={m.id} className="border-border/20">
                                    <TableCell className="font-mono text-xs text-primary">{m.memberId}</TableCell>
                                    <TableCell className="text-sm font-medium">{m.name}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{m.phone}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{[m.address?.place, m.address?.city].filter(Boolean).join(', ') || '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {group.subTeams.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                      No sub-teams yet. <button onClick={() => openAddSubTeam(group.id)} className="text-primary hover:underline">Add one</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add/Edit Team Group Dialog */}
      <Dialog open={showTeamDialog} onOpenChange={setShowTeamDialog}>
        <DialogContent className="glass max-w-md">
          <DialogHeader><DialogTitle className="font-serif">{editingTeamGroup ? 'Edit Team' : 'Add Team'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Team Name</Label>
              <Input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="e.g. Team E" className="bg-secondary/50" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTeamDialog(false)}>Cancel</Button>
            <Button onClick={saveTeamGroup} className="bg-primary">{editingTeamGroup ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Sub-Team Dialog */}
      <Dialog open={showSubTeamDialog} onOpenChange={setShowSubTeamDialog}>
        <DialogContent className="glass max-w-md">
          <DialogHeader><DialogTitle className="font-serif">{editingSubTeamIdx !== null ? 'Edit Sub-Team' : 'Add Sub-Team'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sub-Team Name</Label>
              <Input value={subTeamName} onChange={e => setSubTeamName(e.target.value)} placeholder="e.g. A7" className="bg-secondary/50" />
            </div>
            <div className="space-y-2">
              <Label>Areas (comma-separated)</Label>
              <Input value={subTeamAreas} onChange={e => setSubTeamAreas(e.target.value)} placeholder="e.g. Gandhi Nagar, Sirpuram" className="bg-secondary/50" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubTeamDialog(false)}>Cancel</Button>
            <Button onClick={saveSubTeam} className="bg-primary">{editingSubTeamIdx !== null ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Leaders Dialog */}
      <Dialog open={showLeaderDialog} onOpenChange={setShowLeaderDialog}>
        <DialogContent className="glass max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-serif flex items-center gap-2"><Crown className="w-5 h-5 text-amber-500" /> Assign Leaders</DialogTitle></DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search members..." value={leaderSearch} onChange={e => setLeaderSearch(e.target.value)} className="pl-9 bg-secondary/50" />
          </div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {filteredLeaderMembers.map(m => {
              const isLeader = getCurrentLeaders().includes(m.id);
              return (
                <button key={m.id} onClick={() => toggleLeader(m.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left ${isLeader ? 'bg-amber-500/10 border border-amber-500/30' : 'hover:bg-secondary/50'}`}>
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.memberId} • {m.phone}</p>
                  </div>
                  {isLeader && <CheckCircle2 className="w-5 h-5 text-amber-500" />}
                </button>
              );
            })}
          </div>
          <DialogFooter><Button onClick={() => setShowLeaderDialog(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Members Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="glass max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-serif flex items-center gap-2"><UserPlus className="w-5 h-5 text-primary" /> Assign Members to {assignTarget?.subTeamName}</DialogTitle></DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search members..." value={assignSearch} onChange={e => setAssignSearch(e.target.value)} className="pl-9 bg-secondary/50" />
          </div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {filteredAssignMembers.map(m => {
              const isAssigned = m.team === assignTarget?.subTeamName;
              return (
                <button key={m.id} onClick={() => toggleMemberAssign(m)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left ${isAssigned ? 'bg-primary/10 border border-primary/30' : 'hover:bg-secondary/50'}`}>
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.memberId} • {m.team || 'Unassigned'}</p>
                  </div>
                  {isAssigned && <CheckCircle2 className="w-5 h-5 text-primary" />}
                </button>
              );
            })}
          </div>
          <DialogFooter><Button onClick={() => setShowAssignDialog(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamsManagement;
