import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { getMembers, getAttendance, getEvents, getFollowUps, createFollowUp, updateFollowUp } from '@/services/firestore';
import { Member, Attendance, ChurchEvent, FollowUp as FollowUpType, FELLOWSHIP_OPTIONS } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useTeams } from '@/contexts/TeamContext';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Phone, MapPin, MessageCircle, CheckCircle2, AlertCircle, Users, Loader2, Filter } from 'lucide-react';
import { toast } from 'sonner';

interface FollowUpStatus {
  [memberId: string]: {
    id?: string; // Firestore document ID for updates
    status: 'pending' | 'contacted' | 'unreachable';
    remarks: string;
  };
}



const FollowUp: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const { teamGroups: teamStructure } = useTeams();
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpStatus>({});
  const [savingStatus, setSavingStatus] = useState<{ [memberId: string]: boolean }>({});
  const [memberStatusFilter, setMemberStatusFilter] = useState<string>('all');
  const [fellowshipFilter, setFellowshipFilter] = useState<string>('all');

  const canEdit = hasPermission('followup.edit');

  // Fetch data from Firestore
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [membersData, attendanceData, eventsData, followUpsData] = await Promise.all([
          getMembers(),
          getAttendance(),
          getEvents(),
          getFollowUps()
        ]);
        setMembers(membersData);
        setAttendance(attendanceData);
        setEvents(eventsData);
        setFollowUps(followUpsData);
        if (eventsData.length > 0) {
          setSelectedEventId(eventsData[0].id);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);



  // Get the selected event
  const selectedEvent = events.find(e => e.id === selectedEventId) || events[0];

  // Get attendance info for the selected event
  const selectedEventAttendance = useMemo(() => {
    if (!selectedEvent) return new Set<string>();
    return new Set(
      attendance.filter(a => a.eventId === selectedEvent.id).map(a => a.memberId)
    );
  }, [selectedEvent, attendance]);

  // Initialize followUpStatus from Firestore data for the selected event
  useEffect(() => {
    if (!selectedEvent) return;
    
    const eventFollowUps = followUps.filter(f => f.eventId === selectedEvent.id);
    const statusMap: FollowUpStatus = {};
    
    eventFollowUps.forEach(fu => {
      statusMap[fu.memberId] = {
        id: fu.id,
        status: fu.status,
        remarks: fu.remarks || ''
      };
    });
    
    setFollowUpStatus(statusMap);
  }, [followUps, selectedEvent]);

  // Get all team members with their attendance status
  const teamMembersWithStatus = useMemo(() => {
    if (!selectedTeam) return [];
    
    return members
      .filter(m => m.team === selectedTeam)
      .map(member => ({
        ...member,
        isPresent: selectedEventAttendance.has(member.id)
      }));
  }, [selectedTeam, selectedEventAttendance, members]);

  const displayMembers = useMemo(() => {
    let filtered = teamMembersWithStatus.filter(m => !m.isPresent);
    
    // Apply member status filter
    if (memberStatusFilter && memberStatusFilter !== 'all') {
      filtered = filtered.filter(m => m.status === memberStatusFilter);
    }

    // Apply fellowship filter
    if (fellowshipFilter && fellowshipFilter !== 'all') {
      filtered = filtered.filter(m => m.fellowship === fellowshipFilter);
    }
    
    return filtered;
  }, [teamMembersWithStatus, memberStatusFilter, fellowshipFilter]);

  const absentCount = teamMembersWithStatus.filter(m => !m.isPresent).length;
  const presentCount = teamMembersWithStatus.filter(m => m.isPresent).length;

  // Save follow-up to Firestore
  const saveFollowUp = useCallback(async (memberId: string, status: 'pending' | 'contacted' | 'unreachable', remarks: string) => {
    if (!selectedEvent || !user) return;
    
    setSavingStatus(prev => ({ ...prev, [memberId]: true }));
    
    try {
      const existingFollowUp = followUpStatus[memberId];
      
      if (existingFollowUp?.id) {
        // Update existing follow-up
        await updateFollowUp(existingFollowUp.id, {
          status,
          remarks,
          updatedAt: new Date().toISOString(),
          updatedBy: user.id
        });
      } else {
        // Create new follow-up
        const newId = await createFollowUp({
          memberId,
          eventId: selectedEvent.id,
          status,
          remarks,
          updatedAt: new Date().toISOString(),
          updatedBy: user.id
        });
        
        // Update local state with the new ID
        setFollowUpStatus(prev => ({
          ...prev,
          [memberId]: { ...prev[memberId], id: newId }
        }));
      }
      
      toast.success('Follow-up saved');
    } catch (error) {
      console.error('Error saving follow-up:', error);
      toast.error('Failed to save follow-up');
    } finally {
      setSavingStatus(prev => ({ ...prev, [memberId]: false }));
    }
  }, [selectedEvent, user, followUpStatus]);

  const updateStatus = useCallback((memberId: string, status: 'pending' | 'contacted' | 'unreachable') => {
    const currentRemarks = followUpStatus[memberId]?.remarks || '';
    
    setFollowUpStatus(prev => ({
      ...prev,
      [memberId]: { ...prev[memberId], status, remarks: currentRemarks }
    }));
    
    // Auto-save when status changes
    saveFollowUp(memberId, status, currentRemarks);
  }, [followUpStatus, saveFollowUp]);

  const updateRemarks = useCallback((memberId: string, remarks: string) => {
    const currentStatus = followUpStatus[memberId]?.status || 'pending';
    
    setFollowUpStatus(prev => ({
      ...prev,
      [memberId]: { ...prev[memberId], status: currentStatus, remarks }
    }));
  }, [followUpStatus]);

  // Save remarks on blur (when user finishes typing)
  const handleRemarksBlur = useCallback((memberId: string) => {
    const current = followUpStatus[memberId];
    if (current) {
      saveFollowUp(memberId, current.status, current.remarks);
    }
  }, [followUpStatus, saveFollowUp]);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'contacted':
        return <Badge className="badge-success"><CheckCircle2 className="w-3 h-3 mr-1" />Contacted</Badge>;
      case 'unreachable':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertCircle className="w-3 h-3 mr-1" />Unreachable</Badge>;
      default:
        return <Badge className="badge-warning"><MessageCircle className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const getAttendanceBadge = (isPresent: boolean) => {
    if (isPresent) {
      return <Badge className="badge-success"><CheckCircle2 className="w-3 h-3 mr-1" />Present</Badge>;
    }
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertCircle className="w-3 h-3 mr-1" />Absent</Badge>;
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="font-serif text-3xl font-bold text-gold-gradient">Follow-Up</h1>
          <p className="text-muted-foreground">
            Track and follow up with team members and their attendance status
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:100ms]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Event</Label>
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue placeholder="Select Event" />
              </SelectTrigger>
              <SelectContent>
                {events.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label className="text-sm font-medium mb-2 block">Team</Label>
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue placeholder="Select Team" />
              </SelectTrigger>
              <SelectContent>
                {teamStructure.map(group => (
                  <React.Fragment key={group.name}>
                    <SelectItem value={`__group__${group.name}`} disabled className="font-semibold text-primary text-xs uppercase tracking-wider">
                      {group.name}
                    </SelectItem>
                    {group.subTeams.map(st => (
                      <SelectItem key={st.name} value={st.name} className="pl-6">
                        {st.name} — {st.areas[0]}{st.areas.length > 1 ? ` (+${st.areas.length - 1})` : ''}
                      </SelectItem>
                    ))}
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              Member Status
            </Label>
            <Select value={memberStatusFilter} onValueChange={setMemberStatusFilter}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="long_absent">Long Absent</SelectItem>
                <SelectItem value="out_of_station">Out of Station</SelectItem>
                <SelectItem value="do_not_disturb">Do not Disturb</SelectItem>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="occasional_visitor">Occasional Visitor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              Fellowship
            </Label>
            <Select value={fellowshipFilter} onValueChange={setFellowshipFilter}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue placeholder="All Fellowships" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Fellowships</SelectItem>
                {FELLOWSHIP_OPTIONS.map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Team Stats */}
      {selectedTeam && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in [animation-delay:150ms]">
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{teamMembersWithStatus.length}</p>
              <p className="text-xs text-muted-foreground">Total Members</p>
            </div>
          </div>
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-400">{presentCount}</p>
              <p className="text-xs text-muted-foreground">Present</p>
            </div>
          </div>
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <AlertCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{absentCount}</p>
              <p className="text-xs text-muted-foreground">Absent</p>
            </div>
          </div>
        </div>
      )}

      {/* Members List */}
      {selectedTeam && (
        <div className="space-y-4 animate-fade-in [animation-delay:200ms]">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">
              Absent Members - {selectedTeam} ({displayMembers.length})
            </h3>
          </div>

          {displayMembers.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
              <p className="text-foreground font-medium">
                No members found
              </p>
              <p className="text-muted-foreground">
                Try adjusting the filters or select a different team.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {displayMembers.map((member, index) => {
                const memberStatus = followUpStatus[member.id];

                return (
                  <div
                    key={member.id}
                    className={`glass rounded-xl p-6 animate-fade-in ${!member.isPresent ? 'border-l-4 border-l-red-500/50' : ''}`}
                    style={{ animationDelay: `${(index + 3) * 100}ms` }}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                      {/* Member Info */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-semibold text-lg">{member.name}</h4>
                            <p className="text-sm text-muted-foreground font-mono">{member.memberId}</p>
                          </div>
                          <div className="flex gap-2">
                            {getAttendanceBadge(member.isPresent)}
                            {getStatusBadge(memberStatus?.status)}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="w-4 h-4 text-primary" />
                            <a href={`tel:${member.phone}`} className="hover:text-primary transition-colors">
                              {member.phone}
                            </a>
                          </div>
                          <div className="flex items-start gap-2 text-muted-foreground">
                            <MapPin className="w-4 h-4 text-primary mt-0.5" />
                            <span>
                              {member.address.place}, {member.address.city}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Follow-up Actions */}
                      {canEdit && !member.isPresent && (
                        <div className="lg:w-80 space-y-3">
                          <div className="space-y-2">
                            <Label className="text-xs">Follow-Up Status</Label>
                            <Select
                              value={memberStatus?.status || 'pending'}
                              onValueChange={(value) => updateStatus(member.id, value as any)}
                            >
                              <SelectTrigger className="bg-secondary/50">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="contacted">Contacted</SelectItem>
                                <SelectItem value="unreachable">Unreachable</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs">Remarks</Label>
                            <Textarea
                              value={memberStatus?.remarks || ''}
                              onChange={(e) => updateRemarks(member.id, e.target.value)}
                              onBlur={() => handleRemarksBlur(member.id)}
                              placeholder="Add notes..."
                              className="bg-secondary/50 resize-none"
                              rows={2}
                              disabled={savingStatus[member.id]}
                            />
                            {savingStatus[member.id] && (
                              <p className="text-xs text-muted-foreground">Saving...</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FollowUp;
