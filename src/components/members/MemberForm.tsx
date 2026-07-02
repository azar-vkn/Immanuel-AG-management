import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Member, MemberStatus, RelationshipType, FellowshipType, FELLOWSHIP_OPTIONS } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useTeams } from '@/contexts/TeamContext';
import { getMembers } from '@/services/firestore';
import { Search, AlertTriangle, Users, UserPlus, Crown, ChevronDown, ChevronUp, Phone, User, Copy } from 'lucide-react';

interface MemberFormProps {
  member?: Member;
  onSave: (member: Member) => void;
  onCancel: () => void;
}

type MemberCategory = 'new_family_head' | 'existing_family_member';

const RELATIONSHIP_OPTIONS: RelationshipType[] = [
  'Head', 'Wife', 'Husband', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister',
  'Grandson', 'Granddaughter', 'Grandfather', 'Grandmother', 'Son-In-Law', 'Daughter-In-Law', 'Father-In-Law', 'Mother-In-Law', 'Dependent', 'Other'
];

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface DuplicateWarning {
  type: 'phone' | 'name_dob';
  message: string;
  matchingMember: Member;
  familyHead?: Member;
}

export const MemberForm: React.FC<MemberFormProps> = ({ member, onSave, onCancel }) => {
  const { teamGroups: teamGroupsData, getTeamGroupForSubTeam } = useTeams();
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [memberCategory, setMemberCategory] = useState<MemberCategory>('new_family_head');
  const [selectedFamilyHead, setSelectedFamilyHead] = useState<Member | null>(null);
  const [familyHeadSearch, setFamilyHeadSearch] = useState('');
  const [showFamilyHeadDropdown, setShowFamilyHeadDropdown] = useState(false);
  const [showFamilyPreview, setShowFamilyPreview] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState<DuplicateWarning[]>([]);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    name: member?.name || '',
    tamilName: member?.tamilName || '',
    dob: member?.dob || '',
    gender: member?.gender || 'male',
    phone: member?.phone || '',
    place: member?.address?.place || '',
    city: member?.address?.city || '',
    district: member?.address?.district || '',
    state: member?.address?.state || '',
    country: member?.address?.country || 'India',
    pincode: member?.address?.pincode || '',
    tamilPlace: member?.tamilAddress?.place || '',
    tamilCity: member?.tamilAddress?.city || '',
    tamilDistrict: member?.tamilAddress?.district || '',
    tamilState: member?.tamilAddress?.state || '',
    relationship: (member?.relationship || 'Head') as RelationshipType,
    maritalStatus: member?.maritalStatus || 'single',
    anniversaryDate: member?.anniversaryDate || '',
    baptismStatus: member?.baptismStatus || 'not_baptized',
    baptismDate: member?.baptismDate || '',
    churchRole: member?.churchRole || 'attendee',
    fellowship: member?.fellowship || '',
    team: member?.team || '',
    teamGroup: '',
    status: member?.status || 'regular',
    expiredDate: member?.expiredDate || '',
    whatsappEnabled: member?.whatsappEnabled ?? true,
    remarks: member?.remarks || '',

  });

  // Auto-set teamGroup from member's existing team
  useEffect(() => {
    if (member?.team && teamGroupsData.length > 0) {
      const group = getTeamGroupForSubTeam(member.team);
      if (group) setFormData(prev => ({ ...prev, teamGroup: group }));
    }
  }, [member, teamGroupsData]);

  const [nextBaseMemberId, setNextBaseMemberId] = useState<string>('IAG00001');

  // Debounced values for duplicate detection
  const debouncedPhone = useDebounce(formData.phone, 400);
  const debouncedName = useDebounce(formData.name, 400);
  const debouncedDob = useDebounce(formData.dob, 400);
  const debouncedFamilySearch = useDebounce(familyHeadSearch, 300);

  // Fetch all members
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const existingMembers = await getMembers();
        setAllMembers(existingMembers);
        
        if (!member) {
          const baseNumbers = existingMembers
            .map(m => {
              const match = m.memberId?.match(/^IAG(\d+)/);
              return match ? parseInt(match[1], 10) : 0;
            })
            .filter(n => !isNaN(n));
          
          const maxNumber = baseNumbers.length > 0 ? Math.max(...baseNumbers) : 0;
          setNextBaseMemberId(`IAG${(maxNumber + 1).toString().padStart(5, '0')}`);
        }
      } catch (error) {
        console.error('Error fetching members:', error);
        setNextBaseMemberId('IAG00001');
      }
    };
    fetchMembers();
  }, [member]);

  // Duplicate detection
  useEffect(() => {
    if (member) return; // Skip for edits
    const warnings: DuplicateWarning[] = [];

    // Phone match
    if (debouncedPhone.length >= 8) {
      const phoneMatch = allMembers.find(m => m.phone === debouncedPhone);
      if (phoneMatch) {
        const head = allMembers.find(h => h.isHeadOfFamily && h.familyId === phoneMatch.familyId);
        warnings.push({
          type: 'phone',
          message: `Phone number "${debouncedPhone}" already belongs to ${phoneMatch.name} (${phoneMatch.memberId})`,
          matchingMember: phoneMatch,
          familyHead: head || undefined,
        });
      }
    }

    // Name + DOB match
    if (debouncedName.length >= 3 && debouncedDob) {
      const nameMatch = allMembers.find(m =>
        m.name.toLowerCase() === debouncedName.toLowerCase() && m.dob === debouncedDob
      );
      if (nameMatch) {
        const head = allMembers.find(h => h.isHeadOfFamily && h.familyId === nameMatch.familyId);
        warnings.push({
          type: 'name_dob',
          message: `A member named "${nameMatch.name}" with same DOB already exists (${nameMatch.memberId})`,
          matchingMember: nameMatch,
          familyHead: head || undefined,
        });
      }
    }

    setDuplicateWarnings(warnings);
  }, [debouncedPhone, debouncedName, debouncedDob, allMembers, member]);

  // Get all family heads
  const familyHeads = useMemo(() => {
    return allMembers.filter(m => m.isHeadOfFamily);
  }, [allMembers]);

  // Filter family heads based on debounced search (by name, phone, memberId)
  const filteredFamilyHeads = useMemo(() => {
    if (!debouncedFamilySearch.trim()) return familyHeads;
    const query = debouncedFamilySearch.toLowerCase();
    return familyHeads.filter(h =>
      h.name.toLowerCase().includes(query) ||
      h.memberId.toLowerCase().includes(query) ||
      h.phone.includes(query)
    );
  }, [familyHeads, debouncedFamilySearch]);

  // Get family members count for a family
  const getFamilyMemberCount = useCallback((familyId: string) => {
    return allMembers.filter(m => m.familyId === familyId).length;
  }, [allMembers]);

  // Get family members for preview
  const getFamilyMembers = useCallback((familyId: string) => {
    return allMembers.filter(m => m.familyId === familyId);
  }, [allMembers]);

  // Generate next member ID for existing family
  const getNextFamilyMemberId = (familyId: string): string => {
    const familyMembers = allMembers.filter(m => m.familyId === familyId && !m.isHeadOfFamily);
    const memberNumbers = familyMembers
      .map(m => {
        const match = m.memberId?.match(/-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n));
    
    const maxNumber = memberNumbers.length > 0 ? Math.max(...memberNumbers) : 0;
    return `${familyId}-${maxNumber + 1}`;
  };

  // Pre-fill address when selecting a family head
  useEffect(() => {
    if (selectedFamilyHead && memberCategory === 'existing_family_member') {
      setFormData(prev => ({
        ...prev,
        place: selectedFamilyHead.address?.place || prev.place,
        city: selectedFamilyHead.address?.city || prev.city,
        district: selectedFamilyHead.address?.district || prev.district,
        state: selectedFamilyHead.address?.state || prev.state,
        country: selectedFamilyHead.address?.country || prev.country,
        pincode: selectedFamilyHead.address?.pincode || prev.pincode,
      }));
    }
  }, [selectedFamilyHead, memberCategory]);

  // Link to existing family from duplicate warning
  const handleLinkToFamily = (warning: DuplicateWarning) => {
    const head = warning.familyHead || warning.matchingMember;
    if (head) {
      setMemberCategory('existing_family_member');
      setSelectedFamilyHead(head.isHeadOfFamily ? head : (allMembers.find(m => m.isHeadOfFamily && m.familyId === head.familyId) || head));
      setFamilyHeadSearch(head.name);
      setShowFamilyHeadDropdown(false);
      setDismissedWarnings(prev => new Set([...prev, `${warning.type}-${warning.matchingMember.id}`]));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation for existing family
    if (!member && memberCategory === 'existing_family_member') {
      if (!selectedFamilyHead) return;
      if (formData.relationship === 'Head') return;
    }
    // Validation for Fellowship
    if (!formData.fellowship) {
      alert("Please select a fellowship");
      return;
    }
    
    let memberId: string;
    let familyId: string;
    let isHeadOfFamily: boolean;
    let relationship: RelationshipType;

    if (member) {
      memberId = member.memberId;
      familyId = member.familyId || member.memberId;
      isHeadOfFamily = member.isHeadOfFamily ?? !member.memberId.includes('-');
      relationship = formData.relationship;
    } else if (memberCategory === 'new_family_head') {
      memberId = nextBaseMemberId;
      familyId = nextBaseMemberId;
      isHeadOfFamily = true;
      relationship = 'Head';
    } else {
      if (!selectedFamilyHead) return;
      familyId = selectedFamilyHead.familyId || selectedFamilyHead.memberId;
      memberId = getNextFamilyMemberId(familyId);
      isHeadOfFamily = false;
      relationship = formData.relationship;
    }

    const newMember: Member = {
      id: member?.id || crypto.randomUUID(),
      memberId,
      name: formData.name,
      tamilName: formData.tamilName || undefined,
      dob: formData.dob,
      gender: formData.gender as 'male' | 'female',
      phone: formData.phone,
      address: {
        place: formData.place,
        city: formData.city,
        district: formData.district,
        state: formData.state,
        country: formData.country,
        pincode: formData.pincode,
      },
      tamilAddress: (formData.tamilPlace || formData.tamilCity || formData.tamilDistrict || formData.tamilState) ? {
        place: formData.tamilPlace || undefined,
        city: formData.tamilCity || undefined,
        district: formData.tamilDistrict || undefined,
        state: formData.tamilState || undefined,
      } : undefined,
      familyId,
      isHeadOfFamily,
      relationship,
      maritalStatus: formData.maritalStatus as Member['maritalStatus'],
      anniversaryDate: formData.anniversaryDate || undefined,
      baptismStatus: formData.baptismStatus as 'baptized' | 'not_baptized',
      baptismDate: formData.baptismDate || undefined,
      churchRole: formData.churchRole as Member['churchRole'],
      fellowship: (formData.fellowship || undefined) as FellowshipType | undefined,
      team: formData.team || undefined,
      status: formData.status as MemberStatus,
      expiredDate: formData.status === 'expired' ? formData.expiredDate || undefined : undefined,
      whatsappEnabled: formData.whatsappEnabled,
      remarks: formData.remarks || undefined,
      createdAt: member?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(newMember);
  };

  const isEditMode = !!member;
  const activeWarnings = duplicateWarnings.filter(w => !dismissedWarnings.has(`${w.type}-${w.matchingMember.id}`));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Member Category - Only show when adding new member */}
      {!isEditMode && (
        <div className="space-y-4">
          <h3 className="font-semibold text-foreground border-b border-border/50 pb-2 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Member Category
          </h3>
          <RadioGroup
            value={memberCategory}
            onValueChange={(value: MemberCategory) => {
              setMemberCategory(value);
              setSelectedFamilyHead(null);
              setFamilyHeadSearch('');
              setShowFamilyPreview(false);
              if (value === 'new_family_head') {
                setFormData(prev => ({ ...prev, relationship: 'Head' }));
              } else {
                setFormData(prev => ({ ...prev, relationship: 'Wife' }));
              }
            }}
            className="flex flex-col gap-3"
          >
            <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
              memberCategory === 'new_family_head'
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border/50 bg-secondary/30 hover:bg-secondary/50'
            }`}>
              <RadioGroupItem value="new_family_head" id="new_family_head" className="mt-0.5" />
              <Label htmlFor="new_family_head" className="cursor-pointer flex-1">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span className="font-medium">Create New Family</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">This member becomes the Family Head with a new Family ID</p>
                {memberCategory === 'new_family_head' && (
                  <Badge variant="outline" className="mt-2 text-primary border-primary/30">
                    Member ID: {nextBaseMemberId}
                  </Badge>
                )}
              </Label>
            </div>

            <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
              memberCategory === 'existing_family_member'
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border/50 bg-secondary/30 hover:bg-secondary/50'
            }`}>
              <RadioGroupItem value="existing_family_member" id="existing_family_member" className="mt-0.5" />
              <Label htmlFor="existing_family_member" className="cursor-pointer flex-1">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">Add to Existing Family</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Link this member to an existing family</p>
              </Label>
            </div>
          </RadioGroup>

          {/* Family Head Selection */}
          {memberCategory === 'existing_family_member' && (
            <div className="space-y-3 p-4 rounded-lg border border-border/50 bg-secondary/20">
              <Label className="font-medium">Select Family Head <span className="text-destructive">*</span></Label>
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, phone, or member ID..."
                    value={familyHeadSearch}
                    onChange={(e) => {
                      setFamilyHeadSearch(e.target.value);
                      setShowFamilyHeadDropdown(true);
                      if (selectedFamilyHead && e.target.value !== selectedFamilyHead.name) {
                        setSelectedFamilyHead(null);
                        setShowFamilyPreview(false);
                      }
                    }}
                    onFocus={() => setShowFamilyHeadDropdown(true)}
                    className="pl-10 bg-background"
                  />
                </div>
                {showFamilyHeadDropdown && !selectedFamilyHead && filteredFamilyHeads.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {filteredFamilyHeads.map((head) => {
                      const count = getFamilyMemberCount(head.familyId);
                      return (
                        <button
                          key={head.id}
                          type="button"
                          className="w-full px-4 py-3 text-left hover:bg-accent/50 flex items-center gap-3 border-b border-border/30 last:border-b-0 transition-colors"
                          onClick={() => {
                            setSelectedFamilyHead(head);
                            setFamilyHeadSearch(head.name);
                            setShowFamilyHeadDropdown(false);
                          }}
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{head.name} Family</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>Head: {head.name}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {head.phone}
                              </span>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {count} {count === 1 ? 'member' : 'members'}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
                {showFamilyHeadDropdown && !selectedFamilyHead && familyHeadSearch.trim() && filteredFamilyHeads.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg p-4 text-center text-sm text-muted-foreground">
                    No families found matching "{familyHeadSearch}"
                  </div>
                )}
              </div>

              {/* Selected Family Card */}
              {selectedFamilyHead && (
                <div className="rounded-lg border-2 border-primary/30 bg-primary/5 overflow-hidden">
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Crown className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{selectedFamilyHead.name} Family</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedFamilyHead.memberId} • {selectedFamilyHead.phone} •{' '}
                          {getFamilyMemberCount(selectedFamilyHead.familyId)} members
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowFamilyPreview(!showFamilyPreview)}
                        className="text-xs"
                      >
                        {showFamilyPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {showFamilyPreview ? 'Hide' : 'View'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedFamilyHead(null);
                          setFamilyHeadSearch('');
                          setShowFamilyPreview(false);
                        }}
                        className="text-xs text-destructive hover:text-destructive"
                      >
                        Change
                      </Button>
                    </div>
                  </div>

                  {/* Family Members Preview */}
                  {showFamilyPreview && (
                    <div className="border-t border-primary/20 p-3 bg-background/50">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Family Members</p>
                      <div className="space-y-1.5">
                        {getFamilyMembers(selectedFamilyHead.familyId).map(fm => (
                          <div key={fm.id} className="flex items-center justify-between text-sm px-2 py-1.5 rounded bg-secondary/30">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{fm.name}</span>
                              {fm.isHeadOfFamily && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1">Head</Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{fm.relationship} • {fm.memberId}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <Badge variant="outline" className="text-xs text-primary border-primary/30">
                          New Member ID: {getNextFamilyMemberId(selectedFamilyHead.familyId)}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {familyHeads.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No family heads found. Please create a new family first.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Relationship - Show when editing or adding to existing family */}
      {(isEditMode || memberCategory === 'existing_family_member') && (
        <div className="space-y-2">
          <Label htmlFor="relationship">
            Relationship to Family Head <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.relationship}
            onValueChange={(value: RelationshipType) => setFormData({ ...formData, relationship: value })}
            disabled={isEditMode && member?.isHeadOfFamily}
          >
            <SelectTrigger className="bg-secondary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RELATIONSHIP_OPTIONS.filter(r => 
                isEditMode && member?.isHeadOfFamily ? r === 'Head' : r !== 'Head'
              ).map((rel) => (
                <SelectItem key={rel} value={rel}>{rel}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isEditMode && memberCategory === 'existing_family_member' && formData.relationship === 'Head' && (
            <p className="text-xs text-destructive">Please select a valid relationship</p>
          )}
        </div>
      )}

      {/* Duplicate Detection Warnings */}
      {!isEditMode && activeWarnings.length > 0 && (
        <div className="space-y-2">
          {activeWarnings.map((warning, idx) => (
            <Alert key={idx} className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    ⚠ Possible duplicate detected
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">{warning.message}</p>
                  <div className="flex gap-2">
                    {warning.familyHead && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs border-amber-500/50 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                        onClick={() => handleLinkToFamily(warning)}
                      >
                        <UserPlus className="w-3 h-3 mr-1" />
                        Add to {warning.familyHead.name}'s family
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setDismissedWarnings(prev => new Set([...prev, `${warning.type}-${warning.matchingMember.id}`]))}
                    >
                      Continue as new
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Personal Info */}
      <div className="space-y-4">
        <h3 className="font-semibold text-foreground border-b border-border/50 pb-2">
          Personal Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-secondary/50"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tamilName">பெயர் (Tamil Name)</Label>
            <Input
              id="tamilName"
              value={formData.tamilName}
              onChange={(e) => setFormData({ ...formData, tamilName: e.target.value })}
              className="bg-secondary/50"
              placeholder="தமிழில் பெயர்"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dob">Date of Birth</Label>
            <Input
              id="dob"
              type="date"
              value={formData.dob}
              onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gender">Gender *</Label>
            <Select
              value={formData.gender}
              onValueChange={(value: 'male' | 'female') => setFormData({ ...formData, gender: value })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsappEnabled">WhatsApp Automations</Label>
            <div className="flex items-center gap-2 pt-2">
              <Switch
                id="whatsappEnabled"
                checked={formData.whatsappEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, whatsappEnabled: checked })}
              />
              <span className="text-sm text-muted-foreground">Receive birthday/anniversary wishes</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-foreground border-b border-border/50 pb-2">
          Address
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="place">Place / Street *</Label>
            <Input
              id="place"
              value={formData.place}
              onChange={(e) => setFormData({ ...formData, place: e.target.value })}
              className="bg-secondary/50"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="bg-secondary/50"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="district">District</Label>
            <Input
              id="district"
              value={formData.district}
              onChange={(e) => setFormData({ ...formData, district: e.target.value })}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State *</Label>
            <Input
              id="state"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              className="bg-secondary/50"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pincode">Pincode</Label>
            <Input
              id="pincode"
              value={formData.pincode}
              onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
              className="bg-secondary/50"
            />
          </div>
        </div>
      </div>

      {/* Tamil Address (Optional) */}
      <div className="space-y-4">
        <h3 className="font-semibold text-foreground border-b border-border/50 pb-2">
          முகவரி (Tamil Address) <span className="text-xs text-muted-foreground font-normal">— Optional</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="tamilPlace">இடம் (Place)</Label>
            <Input
              id="tamilPlace"
              value={formData.tamilPlace}
              onChange={(e) => setFormData({ ...formData, tamilPlace: e.target.value })}
              className="bg-secondary/50"
              placeholder="தெரு / இடம்"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tamilCity">நகரம் (City)</Label>
            <Input
              id="tamilCity"
              value={formData.tamilCity}
              onChange={(e) => setFormData({ ...formData, tamilCity: e.target.value })}
              className="bg-secondary/50"
              placeholder="நகரம்"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tamilDistrict">மாவட்டம் (District)</Label>
            <Input
              id="tamilDistrict"
              value={formData.tamilDistrict}
              onChange={(e) => setFormData({ ...formData, tamilDistrict: e.target.value })}
              className="bg-secondary/50"
              placeholder="மாவட்டம்"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tamilState">மாநிலம் (State)</Label>
            <Input
              id="tamilState"
              value={formData.tamilState}
              onChange={(e) => setFormData({ ...formData, tamilState: e.target.value })}
              className="bg-secondary/50"
              placeholder="மாநிலம்"
            />
          </div>
        </div>
      </div>

      {/* Church Info */}
      <div className="space-y-4">
        <h3 className="font-semibold text-foreground border-b border-border/50 pb-2">
          Church Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maritalStatus">Marital Status *</Label>
            <Select
              value={formData.maritalStatus}
              onValueChange={(value: 'single' | 'married' | 'widowed' | 'divorced') => setFormData({ ...formData, maritalStatus: value })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="married">Married</SelectItem>
                <SelectItem value="widowed">Widowed</SelectItem>
                <SelectItem value="divorced">Divorced</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formData.maritalStatus === 'married' && (
            <div className="space-y-2">
              <Label htmlFor="anniversaryDate">Anniversary Date</Label>
              <Input
                id="anniversaryDate"
                type="date"
                value={formData.anniversaryDate}
                onChange={(e) => setFormData({ ...formData, anniversaryDate: e.target.value })}
                className="bg-secondary/50"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="baptismStatus">Baptism Status *</Label>
            <Select
              value={formData.baptismStatus}
              onValueChange={(value: 'baptized' | 'not_baptized') => setFormData({ ...formData, baptismStatus: value })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="baptized">Baptized</SelectItem>
                <SelectItem value="not_baptized">Not Baptized</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formData.baptismStatus === 'baptized' && (
            <div className="space-y-2">
              <Label htmlFor="baptismDate">Baptism Date</Label>
              <Input
                id="baptismDate"
                type="date"
                value={formData.baptismDate}
                onChange={(e) => setFormData({ ...formData, baptismDate: e.target.value })}
                className="bg-secondary/50"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="churchRole">Role in Church *</Label>
            <Select
              value={formData.churchRole}
              onValueChange={(value: 'attendee' | 'volunteer' | 'host' | 'operator') => setFormData({ ...formData, churchRole: value })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attendee">Attendee</SelectItem>
                <SelectItem value="volunteer">Volunteer</SelectItem>
                <SelectItem value="host">Host</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fellowship">Fellowship *</Label>
            <Select
              value={formData.fellowship}
              onValueChange={(value: string) => setFormData({ ...formData, fellowship: value })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue placeholder="Select fellowship" />
              </SelectTrigger>
              <SelectContent>
                {FELLOWSHIP_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamGroup">Team</Label>
            <Select
              value={formData.teamGroup}
              onValueChange={(value) => {
                setFormData({ ...formData, teamGroup: value, team: '' });
              }}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {teamGroupsData.map((group) => (
                  <SelectItem key={group.id} value={group.name}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {formData.teamGroup && (
            <div className="space-y-2">
              <Label htmlFor="team">Sub-Team</Label>
              <Select
                value={formData.team}
                onValueChange={(value) => setFormData({ ...formData, team: value })}
              >
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Select sub-team" />
                </SelectTrigger>
                <SelectContent>
                  {teamGroupsData
                    .find(g => g.name === formData.teamGroup)
                    ?.subTeams.map((st) => (
                      <SelectItem key={st.name} value={st.name}>
                        {st.name} — {st.areas[0]}{st.areas.length > 1 ? ` (+${st.areas.length - 1})` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {formData.team && (
                <p className="text-[11px] text-muted-foreground">
                  Areas: {teamGroupsData
                    .find(g => g.name === formData.teamGroup)
                    ?.subTeams.find(st => st.name === formData.team)
                    ?.areas.join(', ')}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="status">Member Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value: MemberStatus) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
          {formData.status === 'expired' && (
            <div className="space-y-2">
              <Label htmlFor="expiredDate">Date of Expiry <span className="text-destructive">*</span></Label>
              <Input
                id="expiredDate"
                type="date"
                value={formData.expiredDate}
                onChange={(e) => setFormData({ ...formData, expiredDate: e.target.value })}
                className="bg-secondary/50"
                required
              />
            </div>
          )}
        </div>
      </div>

      {/* Remarks */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="remarks">Remarks</Label>
          <Textarea
            id="remarks"
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
            className="bg-secondary/50"
            rows={3}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          type="submit" 
          className="bg-primary hover:bg-primary/90"
          disabled={
            !isEditMode && memberCategory === 'existing_family_member' && 
            (!selectedFamilyHead || formData.relationship === 'Head')
          }
        >
          {member ? 'Update Member' : 'Add Member'}
        </Button>
      </div>
    </form>
  );
};
