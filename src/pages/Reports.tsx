import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { getEvents, getMembers, getAttendance } from '@/services/firestore';
import { ChurchEvent, Member, Attendance, FellowshipType } from '@/types';
import { transliterateToTamil } from '@/lib/tamilTransliterate';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileBarChart, Download, Users, UserCheck, UserX, Loader2, PartyPopper } from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { toast } from 'sonner';
import { FellowshipReport } from '@/components/reports/FellowshipReport';
import { CelebrationReport } from '@/components/reports/CelebrationReport';
import { OverallMemberReport } from '@/components/reports/OverallMemberReport';
import { useTeams } from '@/contexts/TeamContext';

const getMemberFellowship = (member: Member): string => {
  if (member.fellowship) return member.fellowship;
  const age = member.dob ? differenceInYears(new Date(), new Date(member.dob)) : 0;
  if (age < 13) return 'Children';
  const isMarried = member.maritalStatus === 'married';
  if (!isMarried && age < 40) {
    return member.gender === 'male' ? 'Youth Boys Fellowship' : 'Youth Girls Fellowship';
  }
  return member.gender === 'male' ? "Men's Fellowship" : "Women's Fellowship";
};

const Reports: React.FC = () => {
  const { teamGroups: teamStructure } = useTeams();
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [reportType, setReportType] = useState<'present' | 'absent' | 'all'>('all');
  const [memberStatusFilter, setMemberStatusFilter] = useState<Member['status'] | 'all'>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [fellowshipFilter, setFellowshipFilter] = useState<string>('all');

  // Fetch data from Firestore
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [eventsData, membersData, attendanceData] = await Promise.all([
          getEvents(),
          getMembers(),
          getAttendance()
        ]);
        setEvents(eventsData);
        setMembers(membersData);
        setAttendance(attendanceData);
        // Auto-select the most recent event (events are sorted by date desc)
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

  const selectedEvent = events.find(e => e.id === selectedEventId);

  const eligibleMembers = useMemo(() => {
    if (!selectedEvent) return [];
    const eventFellowships = selectedEvent.fellowships;
    
    // If no fellowships are set (legacy events), show all members
    if (!eventFellowships || eventFellowships.length === 0) return members;

    return members.filter(m => {
      // Apply status filter
      if (memberStatusFilter === 'all') {
        if (m.status === 'expired') return false; // Exclude expired by default
      } else {
        if (m.status !== memberStatusFilter) return false;
      }
      
      // Apply team filter
      if (teamFilter !== 'all') {
        const teamGroup = teamStructure.find(g => g.name === teamFilter);
        if (teamGroup) {
          const groupSubTeams = teamGroup.subTeams.map(st => st.name);
          if (!groupSubTeams.includes(m.team || '')) return false;
        } else {
          if (m.team !== teamFilter) return false;
        }
      }
      
      const memberFellowship = getMemberFellowship(m);
      if (fellowshipFilter !== 'all' && memberFellowship !== fellowshipFilter) return false;
      return eventFellowships.includes(memberFellowship as FellowshipType);
    });
  }, [selectedEvent, members, memberStatusFilter, teamFilter, fellowshipFilter]);

  const reportData = useMemo(() => {
    if (!selectedEventId) return [];

    const eventAttendanceIds = new Set(
      attendance.filter(a => a.eventId === selectedEventId).map(a => a.memberId)
    );

    let baseMembers = [];
    switch (reportType) {
      case 'present':
        baseMembers = eligibleMembers.filter(m => eventAttendanceIds.has(m.id));
        break;
      case 'absent':
        baseMembers = eligibleMembers.filter(m => !eventAttendanceIds.has(m.id));
        break;
      default:
        baseMembers = eligibleMembers;
        break;
    }

    return baseMembers.map(m => ({
      ...m,
      isPresent: eventAttendanceIds.has(m.id),
      derivedFellowship: getMemberFellowship(m)
    }));
  }, [selectedEventId, reportType, eligibleMembers, attendance]);

  const handleExport = () => {
    const headers = ['Member ID', 'Name', 'Tamil Name', 'Phone', 'Tamil Place', 'Tamil City', 'Team', 'Fellowship', 'Member Status', 'Attendance', 'Report'];
    const rows = reportData.map(m => [
      m.memberId,
      m.name,
      m.tamilName || transliterateToTamil(m.name),
      m.phone,
      m.tamilAddress?.place || (m.address?.place ? transliterateToTamil(m.address.place) : ''),
      m.tamilAddress?.city || (m.address?.city ? transliterateToTamil(m.address.city) : ''),
      m.team || '-',
      (m as any).derivedFellowship,
      (m.status || 'regular').replace(/_/g, ' '),
      reportType === 'all' 
        ? ((m as any).isPresent ? 'Present' : 'Absent') 
        : reportType === 'present' ? 'Present' : 'Absent',
      ''
    ]);

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
    XLSX.writeFile(wb, `attendance-report-${selectedEvent?.date || 'all'}.xlsx`);
  };

  const presentCount = useMemo(() => {
    if (!selectedEventId || !eligibleMembers.length) return 0;
    const eligibleIds = new Set(eligibleMembers.map(m => m.id));
    // Deduplicate: count unique members, not raw attendance records
    const uniquePresentIds = new Set(
      attendance
        .filter(a => a.eventId === selectedEventId && eligibleIds.has(a.memberId))
        .map(a => a.memberId)
    );
    return uniquePresentIds.size;
  }, [selectedEventId, attendance, eligibleMembers]);

  const absentCount = eligibleMembers.length - presentCount;

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
        <h1 className="font-serif text-3xl font-bold text-gold-gradient">Reports</h1>
        <p className="text-muted-foreground">Generate and export attendance reports</p>
      </div>

      <Tabs defaultValue="attendance" className="space-y-6">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="attendance">Attendance Report</TabsTrigger>
          <TabsTrigger value="overall">Overall Member Report</TabsTrigger>
          <TabsTrigger value="celebrations" className="gap-2">
            <PartyPopper className="w-4 h-4" />
            Celebrations Report
          </TabsTrigger>
        </TabsList>

        {/* Attendance Report Tab */}
        <TabsContent value="attendance" className="space-y-6">
          {/* Event Selector */}
          <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:100ms]">
            <div className="space-y-2">
              <Label>Select Event</Label>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger className="bg-secondary/50 max-w-md">
                  <SelectValue placeholder="Choose an event..." />
                </SelectTrigger>
                <SelectContent>
                  {events.map(event => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name} - {format(new Date(event.date), 'MMM dd, yyyy')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedEventId && (
            <>
              {/* Filters */}
              <div className="glass rounded-xl p-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label>Report Type</Label>
                    <Select value={reportType} onValueChange={(v) => setReportType(v as any)}>
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            All Reports
                          </div>
                        </SelectItem>
                        <SelectItem value="present">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-emerald-400" />
                            Present Only
                          </div>
                        </SelectItem>
                        <SelectItem value="absent">
                          <div className="flex items-center gap-2">
                            <UserX className="w-4 h-4 text-red-400" />
                            Absent Only
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Member Status</Label>
                    <Select value={memberStatusFilter} onValueChange={(v) => setMemberStatusFilter(v as any)}>
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Active Members</SelectItem>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="long_absent">Long Absent</SelectItem>
                        <SelectItem value="out_of_station">Out of Station</SelectItem>
                        <SelectItem value="do_not_disturb">Do not Disturb</SelectItem>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="occasional_visitor">Occasional Visitor</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Team</Label>
                    <Select value={teamFilter} onValueChange={setTeamFilter}>
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Teams</SelectItem>
                        {teamStructure.map(group => (
                          <React.Fragment key={group.name}>
                            <SelectItem value={group.name} className="font-semibold text-primary">
                              {group.name} (All)
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

                  <div className="space-y-2">
                    <Label>Fellowship</Label>
                    <Select value={fellowshipFilter} onValueChange={setFellowshipFilter}>
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Fellowships</SelectItem>
                        <SelectItem value="Children">Children</SelectItem>
                        <SelectItem value="Youth Boys Fellowship">Youth Boys Fellowship</SelectItem>
                        <SelectItem value="Youth Girls Fellowship">Youth Girls Fellowship</SelectItem>
                        <SelectItem value="Men's Fellowship">Men's Fellowship</SelectItem>
                        <SelectItem value="Women's Fellowship">Women's Fellowship</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      onClick={handleExport}
                      disabled={!selectedEventId}
                      className="w-full gap-2 bg-primary hover:bg-primary/90"
                    >
                      <Download className="w-4 h-4" />
                      Export XLSX
                    </Button>
                  </div>
                </div>
              </div>

              {/* Stats Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
                <div className="glass rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-foreground">{eligibleMembers.length}</p>
                  <p className="text-sm text-muted-foreground">Total Members</p>
                </div>
                <div className="glass rounded-xl p-4 text-center border-emerald-500/30">
                  <p className="text-3xl font-bold text-emerald-400">{presentCount}</p>
                  <p className="text-sm text-muted-foreground">Present</p>
                </div>
                <div className="glass rounded-xl p-4 text-center border-red-500/30">
                  <p className="text-3xl font-bold text-red-400">{absentCount}</p>
                  <p className="text-sm text-muted-foreground">Absent</p>
                </div>
              </div>

              {/* Report Table */}
              <div className="mt-8">
                <div className="glass rounded-xl overflow-hidden animate-fade-in">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Member ID</TableHead>
                      <TableHead className="text-muted-foreground">Name</TableHead>
                      <TableHead className="text-muted-foreground">Phone</TableHead>
                      <TableHead className="text-muted-foreground">Address</TableHead>
                      <TableHead className="text-muted-foreground">Team</TableHead>
                      <TableHead className="text-muted-foreground">Fellowship</TableHead>
                      {reportType === 'all' && (
                        <TableHead className="text-muted-foreground">Status</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((member) => (
                      <TableRow key={member.id} className="border-border/30 hover:bg-secondary/30">
                        <TableCell className="font-mono text-sm text-primary">
                          {member.memberId}
                        </TableCell>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell className="text-muted-foreground">{member.phone}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">
                          {[member.address?.place, member.address?.city, member.address?.district].filter(Boolean).join(', ') || '-'}
                        </TableCell>
                        <TableCell>
                          {member.team && (
                            <Badge variant="outline" className="bg-secondary/50">
                              {member.team}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {(member as any).derivedFellowship}
                        </TableCell>
                        {reportType === 'all' && (
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={(member as any).isPresent ? 'badge-success' : 'bg-red-500/20 text-red-400 border-red-500/30'}
                            >
                              {(member as any).isPresent ? 'Present' : 'Absent'}
                            </Badge>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {reportData.length === 0 && (
                  <div className="p-12 text-center text-muted-foreground">
                    <FileBarChart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    No data to display for the selected filters.
                  </div>
                )}
              </div>
            </div>
            </>
          )}

          {!selectedEventId && (
            <div className="glass rounded-xl p-12 text-center text-muted-foreground animate-fade-in">
              <FileBarChart className="w-12 h-12 mx-auto mb-4 opacity-50" />
              Select an event above to view the attendance report.
            </div>
          )}
        </TabsContent>



        {/* Celebrations Tab */}
        <TabsContent value="celebrations">
          <CelebrationReport members={members} />
        </TabsContent>

        {/* Overall Member Report Tab */}
        <TabsContent value="overall">
          <OverallMemberReport members={members} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
