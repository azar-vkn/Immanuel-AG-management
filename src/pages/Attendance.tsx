import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { getEvents, getMembers, getAttendance, markAttendance, deleteAttendance, subscribeToEventAttendance } from '@/services/firestore';
import { FamilyCheckIn, type FamilyGroup } from '@/components/face/FamilyCheckIn';
import { Attendance as AttendanceType, Member, ChurchEvent, FellowshipType } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
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
import { Badge } from '@/components/ui/badge';
import { Search, UserCheck, CheckCircle2, X, Loader2, Users, ScanBarcode, ScanFace, Video } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { format, differenceInYears } from 'date-fns';
import { toast } from 'sonner';

// Face recognition is loaded on demand so its TensorFlow.js bundle never
// enters the main page bundle. It only mounts when face mode is switched on.
/**
 * Height of the camera preview, in viewport-height percent. The family
 * check-in column beside it uses the same cap so the two line up and both stay
 * in view without scrolling.
 */
const FACE_PREVIEW_VH = 45;

const FaceAttendancePanel = React.lazy(() =>
  import('@/components/face/FaceAttendancePanel').then((m) => ({ default: m.FaceAttendancePanel })),
);

// Fellowship categorization: use explicit field if set, otherwise auto-categorize
const getCategoryForMember = (member: Member): FellowshipType => {
  if (member.fellowship) return member.fellowship;
  // Fallback for legacy members without fellowship field
  const age = member.dob ? differenceInYears(new Date(), new Date(member.dob)) : 0;
  if (age < 13) return 'Children';
  const isMarried = member.maritalStatus === 'married';
  if (!isMarried && age < 40) {
    return member.gender === 'male' ? 'Youth Boys Fellowship' : 'Youth Girls Fellowship';
  }
  return member.gender === 'male' ? "Men's Fellowship" : "Women's Fellowship";
};

const FELLOWSHIP_COLORS: Record<FellowshipType, string> = {
  'Children': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Youth Boys Fellowship': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Youth Girls Fellowship': 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  "Men's Fellowship": 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  "Women's Fellowship": 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

const Attendance: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<AttendanceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  // Face recognition toggles — independent: recognition can run with the
  // preview hidden to save screen space.
  const [faceModeEnabled, setFaceModeEnabled] = useState(false);
  const [facePreviewEnabled, setFacePreviewEnabled] = useState(true);
  // Tracks member IDs currently being marked to prevent race condition double-submissions
  const markingInProgress = useRef<Set<string>>(new Set());

  const canMark = hasPermission('attendance.mark');

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

  // Live sync for the selected event, ADDED on top of the one-time load above
  // (which is unchanged). Two PCs marking the same service now see each other's
  // marks within a second, instead of only after a page reload — which
  // previously let the same person be marked twice, once on each machine.
  useEffect(() => {
    if (!selectedEventId) return;
    const unsubscribe = subscribeToEventAttendance(selectedEventId, (live) => {
      // Replace only this event's records; every other event stays as loaded.
      setAttendance(prev => [...prev.filter(a => a.eventId !== selectedEventId), ...live]);
    });
    return () => unsubscribe();
  }, [selectedEventId]);

  const selectedEvent = events.find(e => e.id === selectedEventId);

  // Filter members based on event's selected fellowships
  const eligibleMembers = useMemo(() => {
    if (!selectedEvent) return [];
    const eventFellowships = selectedEvent.fellowships;
    
    // If no fellowships are set (legacy events), show all members
    if (!eventFellowships || eventFellowships.length === 0) return members;

    return members.filter(m => {
      if (m.status === 'expired') return false;
      const memberFellowship = getCategoryForMember(m);
      return eventFellowships.includes(memberFellowship);
    });
  }, [selectedEvent, members]);

  const eventAttendance = useMemo(() => {
    return attendance.filter(a => a.eventId === selectedEventId);
  }, [attendance, selectedEventId]);

  const markedMemberIds = useMemo(() => {
    return new Set(eventAttendance.map(a => a.memberId));
  }, [eventAttendance]);

  const searchResults = useMemo(() => {
    if (!selectedEventId) return [];
    const query = searchQuery.trim();
    if (!query) return [];

    const lowerQuery = query.toLowerCase();
    const searchTerms = lowerQuery.split(/\s+/).filter(Boolean);
    const normalizedQuery = lowerQuery.replace(/[\s.,-]/g, '');
    // Phone matching ignores punctuation so "9788 128131" finds "9788128131".
    const digitsQuery = query.replace(/\D/g, '');

    const filtered = eligibleMembers.filter(m => {
      if (m.status === 'expired') return false;

      const lowerName = m.name.toLowerCase();
      const lowerTamil = (m.tamilName || '').toLowerCase();

      // Multi-word match: allows finding "John Doe" even if name is "John A. Doe"
      const matchTerms = searchTerms.length > 0 && searchTerms.every(term =>
        lowerName.includes(term) || lowerTamil.includes(term)
      );

      // No-space match: allows finding "John Doe" when searching "johndoe"
      const normalizedName = lowerName.replace(/[\s.,-]/g, '');
      const normalizedTamil = lowerTamil.replace(/[\s.,-]/g, '');
      const matchNoSpaces = !!normalizedQuery && (
        normalizedName.includes(normalizedQuery) ||
        normalizedTamil.includes(normalizedQuery)
      );

      const matchId = m.memberId.toLowerCase().includes(lowerQuery);
      const matchPhone = digitsQuery.length > 0 && (m.phone || '').replace(/\D/g, '').includes(digitsQuery);

      return matchTerms || matchNoSpaces || matchId || matchPhone;
    });

    // Sort by Member ID handling numeric suffixes, then limit results
    return filtered
      .sort((a, b) => a.memberId.localeCompare(b.memberId, undefined, { numeric: true }))
      .slice(0, 30);
  }, [selectedEventId, searchQuery, eligibleMembers]);

  // Get family members for a given member (filtered by eligible fellowships)
  const getFamilyMembers = (member: Member): Member[] => {
    if (!member.familyId) return [];
    return eligibleMembers.filter(m => m.familyId === member.familyId);
  };

  const handleMarkAttendance = async (member: Member) => {
    if (markedMemberIds.has(member.id)) {
      toast.info(`${member.name} is already marked present`);
      return;
    }
    // Prevent race condition: block duplicate submissions while async call is in flight
    if (markingInProgress.current.has(member.id)) return;
    markingInProgress.current.add(member.id);
    try {
      const newAttendanceData = {
        eventId: selectedEventId,
        memberId: member.id,
        markedAt: new Date().toISOString(),
        markedBy: user?.id || 'unknown'
      };
      const id = await markAttendance(newAttendanceData);
      setAttendance(prev => [...prev, { id, ...newAttendanceData }]);
      toast.success(`Marked ${member.name} as present`);
    } catch (error) {
      console.error('Error marking attendance:', error);
      toast.error('Failed to mark attendance');
    } finally {
      markingInProgress.current.delete(member.id);
    }
  };

  const handleMarkFamily = async (familyMembers: Member[]) => {
    const membersToMark = familyMembers.filter(m => !markedMemberIds.has(m.id) && !markingInProgress.current.has(m.id));
    
    if (membersToMark.length === 0) {
      toast.info('All family members are already marked present');
      return;
    }

    membersToMark.forEach(m => markingInProgress.current.add(m.id));

    try {
      const newRecords = await Promise.all(membersToMark.map(async (member) => {
        const newAttendanceData = {
          eventId: selectedEventId,
          memberId: member.id,
          markedAt: new Date().toISOString(),
          markedBy: user?.id || 'unknown'
        };
        const id = await markAttendance(newAttendanceData);
        return { id, ...newAttendanceData };
      }));
      
      setAttendance(prev => [...prev, ...newRecords]);
      toast.success(`Marked ${membersToMark.length} family member(s) as present`);
    } catch (error) {
      console.error('Error marking family attendance:', error);
      toast.error('Failed to mark some family members');
    } finally {
      membersToMark.forEach(m => markingInProgress.current.delete(m.id));
    }
  };

  // Handle barcode scan on Enter key: find exact member ID match, mark present, clear field
  const handleBarcodeSubmit = useCallback(async () => {
    const trimmed = barcodeInput.trim();
    if (!trimmed || !selectedEventId) return;

    // Find exact match by memberId (case-insensitive)
    const matchedMember = eligibleMembers.find(
      m => m.memberId.toLowerCase() === trimmed.toLowerCase() && m.status !== 'expired'
    );

    // Clear the field immediately for next scan
    setBarcodeInput('');

    if (!matchedMember) {
      toast.error(`No member found with ID: ${trimmed}`);
      return;
    }

    if (markedMemberIds.has(matchedMember.id)) {
      toast.info(`${matchedMember.name} is already marked present`);
    } else {
      try {
        const newAttendanceData = {
          eventId: selectedEventId,
          memberId: matchedMember.id,
          markedAt: new Date().toISOString(),
          markedBy: user?.id || 'unknown'
        };
        const id = await markAttendance(newAttendanceData);
        setAttendance(prev => [...prev, { id, ...newAttendanceData }]);
        toast.success(`Marked ${matchedMember.name} as present`);
      } catch (error) {
        console.error('Error marking attendance via barcode:', error);
        toast.error('Failed to mark attendance');
      }
    }

    // Re-focus the input for the next scan
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  }, [barcodeInput, selectedEventId, eligibleMembers, markedMemberIds, user]);

  const handleBarcodeKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeSubmit();
    }
  }, [handleBarcodeSubmit]);

  // Stable list of already-present members for the face tracker's dedup set.
  const markedMemberIdList = useMemo(() => Array.from(markedMemberIds), [markedMemberIds]);

  // Bridge from face recognition into the EXISTING marking logic. The tracker
  // only reports matches at or above its confidence gate, so anything arriving
  // here is already confirmed; handleMarkAttendance still performs the same
  // duplicate check it does for barcode and search.
  const handleFaceRecognized = (memberDocId: string, confidence: number) => {
    const member = eligibleMembers.find(
      (m) => m.id === memberDocId && m.status !== 'expired',
    );
    if (!member) {
      const known = members.find((m) => m.id === memberDocId);
      toast.warning(
        known
          ? `${known.name} is not in this event's fellowships`
          : 'Recognised a member who is not eligible for this event',
      );
      return;
    }
    if (markedMemberIds.has(member.id)) return; // already present — stay quiet
    handleMarkAttendance(member);
    toast.success(`Face matched: ${member.name} (${Math.round(confidence * 100)}%)`);
  };

  // ---- Family check-in ----
  // When someone is recognised, offer the rest of their family for one-tap
  // marking. Aimed at young children, who are hard for the camera to catch.
  // Reuses getFamilyMembers() and handleMarkAttendance() — no new marking path.
  const MAX_FAMILY_GROUPS = 6;
  const [recentFamilies, setRecentFamilies] = useState<{ familyId: string; seenMemberId: string }[]>([]);
  // Latest person recognised, tracked separately so the panel can explain
  // why nothing is offered instead of silently showing nothing.
  const [lastSeenMemberId, setLastSeenMemberId] = useState<string | null>(null);

  const handleMemberSeen = useCallback((memberDocId: string) => {
    setLastSeenMemberId(memberDocId);
    const seen = members.find((m) => m.id === memberDocId);
    if (!seen?.familyId) return;
    setRecentFamilies((prev) => {
      // Most recent family on top; a family already showing just moves up.
      const rest = prev.filter((f) => f.familyId !== seen.familyId);
      return [{ familyId: seen.familyId, seenMemberId: seen.id }, ...rest].slice(0, MAX_FAMILY_GROUPS);
    });
  }, [members]);

  const familyGroups = useMemo<FamilyGroup[]>(() => {
    return recentFamilies
      .map(({ familyId, seenMemberId }) => {
        const seen = members.find((m) => m.id === seenMemberId);
        if (!seen) return null;
        const remaining = getFamilyMembers(seen)
          .filter((m) => !markedMemberIds.has(m.id))
          // Children first — they are the reason this panel exists.
          .sort((a, b) => {
            const aChild = getCategoryForMember(a) === 'Children' ? 0 : 1;
            const bChild = getCategoryForMember(b) === 'Children' ? 0 : 1;
            if (aChild !== bChild) return aChild - bChild;
            return a.memberId.localeCompare(b.memberId, undefined, { numeric: true });
          });
        // A family drops out on its own once everyone in it is marked.
        return remaining.length > 0 ? { familyId, seenName: seen.name, members: remaining } : null;
      })
      .filter((g): g is FamilyGroup => g !== null);
    // getFamilyMembers reads eligibleMembers, listed here so this stays in step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentFamilies, members, eligibleMembers, markedMemberIds]);

  const isChildMember = useCallback(
    (m: Member) => getCategoryForMember(m) === 'Children',
    [],
  );

  /**
   * When the latest person recognised has nobody to offer, say why. The three
   * causes look identical otherwise, and one of them (fellowship scope) is easy
   * to mistake for a fault.
   */
  const familyNote = useMemo<string | null>(() => {
    if (!lastSeenMemberId) return null;
    const seen = members.find((m) => m.id === lastSeenMemberId);
    if (!seen) return null;
    // Their family is on screen with people to tap — nothing to explain.
    if (seen.familyId && familyGroups.some((g) => g.familyId === seen.familyId)) return null;

    const relatives = seen.familyId
      ? members.filter((m) => m.familyId === seen.familyId && m.id !== seen.id)
      : [];
    if (relatives.length === 0) {
      return `${seen.name} — no other family members on record`;
    }
    const eligibleRelatives = getFamilyMembers(seen).filter((m) => m.id !== seen.id);
    if (eligibleRelatives.length === 0) {
      return `${seen.name} — family members aren't part of this event's fellowships`;
    }
    return `${seen.name} — whole family already marked`;
    // getFamilyMembers reads eligibleMembers, listed here so this stays in step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSeenMemberId, members, familyGroups, eligibleMembers]);

  // Clear the list when switching events, so one service's families don't
  // carry over into the next.
  useEffect(() => {
    setRecentFamilies([]);
    setLastSeenMemberId(null);
  }, [selectedEventId]);


  const handleRemoveAttendance = async (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    // Find ALL attendance records for this member+event (handles duplicates in Firestore)
    const attendanceRecords = attendance.filter(a => a.eventId === selectedEventId && a.memberId === memberId);
    if (attendanceRecords.length === 0) return;
    try {
      // Delete every duplicate record from Firestore
      await Promise.all(attendanceRecords.map(record => deleteAttendance(record.id)));
      setAttendance(prev => prev.filter(a => !(a.eventId === selectedEventId && a.memberId === memberId)));
      toast.success(`Removed attendance for ${member?.name}`);
    } catch (error) {
      console.error('Error removing attendance:', error);
      toast.error('Failed to remove attendance');
    }
  };

  const presentMembers = useMemo(() => {
    const seenMemberIds = new Set<string>();
    return eventAttendance
      .map(a => ({
        attendance: a,
        member: members.find(m => m.id === a.memberId)
      }))
      .filter(item => item.member) // ensure member exists
      .sort((a, b) => new Date(b.attendance.markedAt).getTime() - new Date(a.attendance.markedAt).getTime())
      // Deduplicate: keep only the first (most recent) attendance entry per member
      .filter(item => {
        if (seenMemberIds.has(item.member!.id)) return false;
        seenMemberIds.add(item.member!.id);
        return true;
      })
      .map(item => item.member!);
  }, [eventAttendance, members]);

  const formatAddress = (member: Member) => {
    const parts = [member.address?.place, member.address?.city, member.address?.district].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '';
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
      <div className="animate-fade-in">
        <h1 className="font-serif text-3xl font-bold text-gold-gradient">Attendance</h1>
        <p className="text-muted-foreground">Mark and manage event attendance</p>
      </div>

      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:100ms]">
        <Label className="text-base font-medium mb-3 block">Select Event</Label>
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

        {/* Show selected event's fellowships */}
        {selectedEvent && selectedEvent.fellowships && selectedEvent.fellowships.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/30">
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Fellowships included in this event:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedEvent.fellowships.map((fellowship) => (
                <Badge
                  key={fellowship}
                  variant="outline"
                  className={`text-xs py-0.5 px-2.5 ${FELLOWSHIP_COLORS[fellowship]}`}
                >
                  {fellowship}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Showing {eligibleMembers.filter(m => m.status !== 'expired').length} eligible members from selected fellowships
            </p>
          </div>
        )}
      </div>

      {selectedEventId && (
        <>
          {canMark && (
            <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:200ms]">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-primary" />
                Mark Attendance
              </h3>
              
              {/* Face Recognition — marks automatically; barcode and search
                  below continue to work exactly as before. */}
              <div className="mb-5 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Label className="flex items-center gap-2 text-primary font-semibold">
                    <ScanFace className="w-4 h-4" />
                    Mark by Face
                  </Label>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="faceModeToggle"
                        checked={faceModeEnabled}
                        onCheckedChange={setFaceModeEnabled}
                      />
                      <Label htmlFor="faceModeToggle" className="text-xs cursor-pointer">
                        Face Detection
                      </Label>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        id="facePreviewToggle"
                        checked={facePreviewEnabled}
                        onCheckedChange={setFacePreviewEnabled}
                        disabled={!faceModeEnabled}
                      />
                      <Label
                        htmlFor="facePreviewToggle"
                        className={`text-xs cursor-pointer flex items-center gap-1 ${
                          !faceModeEnabled ? 'text-muted-foreground' : ''
                        }`}
                      >
                        <Video className="w-3.5 h-3.5" />
                        Camera Preview
                      </Label>
                    </div>
                  </div>
                </div>

                {faceModeEnabled ? (
                  <div className="mt-4">
                    <React.Suspense
                      fallback={
                        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading face recognition...
                        </div>
                      }
                    >
                      <FaceAttendancePanel
                        eventId={selectedEventId}
                        markedMemberIds={markedMemberIdList}
                        onRecognized={handleFaceRecognized}
                        onMemberSeen={handleMemberSeen}
                        showPreview={facePreviewEnabled}
                        previewMaxHeightVh={FACE_PREVIEW_VH}
                        aside={
                          <FamilyCheckIn
                            groups={familyGroups}
                            note={familyNote}
                            isChild={isChildMember}
                            onMark={handleMarkAttendance}
                            onDismiss={(familyId) =>
                              setRecentFamilies((prev) => prev.filter((f) => f.familyId !== familyId))
                            }
                            onClearAll={() => {
                              setRecentFamilies([]);
                              setLastSeenMemberId(null);
                            }}
                            alwaysVisible
                            maxHeightVh={FACE_PREVIEW_VH}
                          />
                        }
                      />
                    </React.Suspense>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">
                    Turn on Face Detection to mark members automatically from the camera. Barcode
                    and search below keep working either way.
                  </p>
                )}
              </div>

              {/* Barcode Scanner Input */}
              <div className="mb-5 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <div className="space-y-2">
                  <Label htmlFor="barcodeInput" className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <ScanBarcode className="w-4 h-4" />
                    Search by Barcode
                  </Label>
                  <div className="relative">
                    <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                    <Input
                      ref={barcodeInputRef}
                      id="barcodeInput"
                      placeholder="Scan or type Member ID and press Enter..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value.trim())}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text').trim();
                        setBarcodeInput(pasted);
                      }}
                      onKeyDown={handleBarcodeKeyDown}
                      className="pl-9 bg-secondary/50 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500/20"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Scan a barcode or type a member ID — press Enter to mark present</p>
                </div>
              </div>

              {/* One field searching name, member ID and phone together —
                  the same three matchers as before, just no longer split
                  across boxes the operator has to choose between. */}
              <div className="space-y-2 mb-4">
                <Label htmlFor="memberSearch">Search Member</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="memberSearch"
                    placeholder="Search by name, phone, or member ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.trimStart())}
                    onPaste={(e) => {
                      e.preventDefault();
                      setSearchQuery(e.clipboardData.getData('text').trim());
                    }}
                    className="pl-9 pr-9 bg-secondary/50"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-border/30">
                  {searchResults.map(member => {
                    const address = formatAddress(member);
                    const familyMembers = getFamilyMembers(member);
                    const hasFamily = familyMembers.length > 1;
                    const memberFellowship = getCategoryForMember(member);
                    return (
                      <div key={member.id} className="space-y-2">
                        <div
                          className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{member.name}</p>
                              <Badge
                                variant="outline"
                                className={`text-[10px] py-0 px-1.5 ${FELLOWSHIP_COLORS[memberFellowship]}`}
                              >
                                {memberFellowship}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {member.memberId} • {member.phone}
                            </p>
                            {address && (
                              <p className="text-xs text-muted-foreground mt-0.5">{address}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {markedMemberIds.has(member.id) ? (
                              <Badge className="badge-success">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Present
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleMarkAttendance(member)}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                <UserCheck className="w-4 h-4 mr-1" />
                                Mark Present
                              </Button>
                            )}
                            {hasFamily && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkFamily(familyMembers)}
                                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-500 border border-emerald-500/30"
                                >
                                  <Users className="w-4 h-4 mr-1" />
                                  Mark Family
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setExpandedFamilyId(expandedFamilyId === member.familyId ? null : member.familyId)}
                                  className="border-primary/50 text-primary hover:bg-primary/10"
                                >
                                  <Users className="w-4 h-4 mr-1" />
                                  {expandedFamilyId === member.familyId ? 'Hide Family' : `Show Family (${familyMembers.length})`}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        {expandedFamilyId === member.familyId && (
                          <div className="ml-8 space-y-2 border-l-2 border-primary/20 pl-4">
                            {familyMembers.filter(fm => fm.id !== member.id).map(fm => {
                              const fmFellowship = getCategoryForMember(fm);
                              return (
                                <div
                                  key={fm.id}
                                  className="flex items-center justify-between p-2 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors gap-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className="font-medium text-sm">{fm.name}</p>
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] py-0 px-1.5 ${FELLOWSHIP_COLORS[fmFellowship]}`}
                                      >
                                        {fmFellowship}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {fm.memberId} • {fm.relationship || 'Member'}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {markedMemberIds.has(fm.id) ? (
                                      <Badge className="badge-success text-xs py-0">
                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                        Present
                                      </Badge>
                                    ) : (
                                      <Button
                                        size="sm"
                                        onClick={() => handleMarkAttendance(fm)}
                                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                                      >
                                        <UserCheck className="w-3 h-3 mr-1" />
                                        Mark
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:300ms]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Present Members ({presentMembers.length})
              </h3>
            </div>

            {presentMembers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No attendance marked yet for this event.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {presentMembers.map(member => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                  >
                    <div>
                      <p className="font-medium text-sm">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.memberId}</p>
                    </div>
                    {canMark && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveAttendance(member.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Attendance;
