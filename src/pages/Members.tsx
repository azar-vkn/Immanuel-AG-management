import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { parse, isValid } from 'date-fns';
import { getMembers, createMember, updateMember, deleteMember } from '@/services/firestore';
import { useTeams } from '@/contexts/TeamContext';
import { Member, MemberStatus } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Search,
  Plus,
  Download,
  Upload,
  Eye,
  Edit2,
  Trash2,
  CreditCard,
  Filter,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Users
} from 'lucide-react';
import { MemberForm } from '@/components/members/MemberForm';
import { MemberIDCard } from '@/components/members/MemberIDCard';
import { MemberViewDialog } from '@/components/members/MemberViewDialog';
import { ImportMapperDialog } from '@/components/members/ImportMapperDialog';
import { toast } from 'sonner';

interface Filters {
  team: string;
  gender: string;
  ageRange: string;
  churchRole: string;
  memberStatus: string;
}

const Members: React.FC = () => {
  const { hasPermission } = useAuth();
  const { teamGroups: teamStructure, allSubTeamNames: allSubTeams } = useTeams();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showIdCard, setShowIdCard] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    team: '',
    gender: '',
    ageRange: '',
    churchRole: '',
    memberStatus: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const importInputRef = useRef<HTMLInputElement>(null);

  // Import mapper state
  const [showMapperDialog, setShowMapperDialog] = useState(false);
  const [importFileColumns, setImportFileColumns] = useState<string[]>([]);
  const [importFileRows, setImportFileRows] = useState<Record<string, string>[]>([]);

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
  };

  // Fetch members from Firestore
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const data = await getMembers();
        setMembers(data);
      } catch (error) {
        console.error('Error fetching members:', error);
        toast.error('Failed to load members');
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, []);

  // Get unique teams from members or fallback to static sub-teams
  const memberTeams = useMemo(() => {
    const uniqueTeams = new Set(members.map(m => m.team).filter(Boolean));
    return uniqueTeams.size > 0 ? Array.from(uniqueTeams).sort() : allSubTeams;
  }, [members]);

  // Calculate age from DOB
  const calculateAge = (dob: string): number => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Check if age is in range
  const isInAgeRange = (dob: string, range: string): boolean => {
    if (!range) return true;
    const age = calculateAge(dob);
    switch (range) {
      case '0-12': return age >= 0 && age <= 12;
      case '13-19': return age >= 13 && age <= 19;
      case '20-35': return age >= 20 && age <= 35;
      case '36-50': return age >= 36 && age <= 50;
      case '51-65': return age >= 51 && age <= 65;
      case '65+': return age > 65;
      default: return true;
    }
  };

  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(Boolean).length;
  }, [filters]);

  const clearFilters = () => {
    setFilters({ team: '', gender: '', ageRange: '', churchRole: '', memberStatus: '' });
  };

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      // Search query filter
      if (searchQuery) {
        const query = searchQuery.trim().toLowerCase();
        const matchesSearch = 
          m.name.toLowerCase().includes(query) ||
          m.phone.includes(searchQuery.trim()) ||
          m.memberId.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // Team filter - match sub-team directly, or if a team group name is selected, match all sub-teams in that group
      if (filters.team) {
        const teamGroup = teamStructure.find(g => g.name === filters.team);
        if (teamGroup) {
          // Team group filter: match any sub-team in the group
          const groupSubTeams = teamGroup.subTeams.map(st => st.name);
          if (!groupSubTeams.includes(m.team || '')) return false;
        } else {
          // Sub-team filter: match exactly
          if (m.team !== filters.team) return false;
        }
      }
      
      // Gender filter
      if (filters.gender && m.gender !== filters.gender) return false;
      
      // Age range filter
      if (filters.ageRange && !isInAgeRange(m.dob, filters.ageRange)) return false;
      
      // Church role filter
      if (filters.churchRole && m.churchRole !== filters.churchRole) return false;
      
      // Member status filter
      if (filters.memberStatus && m.status !== filters.memberStatus) return false;
      
      return true;
    });
  }, [members, searchQuery, filters]);

  // Group members by family
  const groupedMembers = useMemo(() => {
    const familyMap = new Map<string, Member[]>();
    
    filteredMembers.forEach(member => {
      // Use familyId if available, otherwise treat the member as a single-member family
      const familyId = member.familyId || member.memberId;
      if (!familyMap.has(familyId)) {
        familyMap.set(familyId, []);
      }
      familyMap.get(familyId)!.push(member);
    });
    
    // Sort each family: head first, then by memberId
    familyMap.forEach((familyMembers, familyId) => {
      familyMembers.sort((a, b) => {
        if (a.isHeadOfFamily && !b.isHeadOfFamily) return -1;
        if (!a.isHeadOfFamily && b.isHeadOfFamily) return 1;
        return a.memberId.localeCompare(b.memberId);
      });
    });
    
    // Convert to array and sort by head's name
    return Array.from(familyMap.entries())
      .map(([familyId, familyMembers]) => ({
        familyId,
        head: familyMembers.find(m => m.isHeadOfFamily) || familyMembers[0],
        members: familyMembers,
        memberCount: familyMembers.length
      }))
      .sort((a, b) => a.head.memberId.localeCompare(b.head.memberId, undefined, { numeric: true }));
  }, [filteredMembers]);

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

  const expandAllFamilies = () => {
    setExpandedFamilies(new Set(groupedMembers.map(g => g.familyId)));
  };

  const collapseAllFamilies = () => {
    setExpandedFamilies(new Set());
  };

  const canEdit = hasPermission('members.edit');
  const canDelete = hasPermission('members.delete');
  const canCreate = hasPermission('members.create');


  const parseCsv = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const parseLine = (line: string) => {
      // Basic CSV parser handling quotes.
      const out: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          out.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out.map(v => v.trim());
    };

    const headers = parseLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());
    return lines.slice(1).map(line => {
      const values = parseLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });
      return row;
    });
  };

  const downloadXlsx = (filename: string, headers: string[], rows: string[][]) => {
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filename);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this member?')) {
      try {
        await deleteMember(id);
        setMembers(members.filter((m) => m.id !== id));
        toast.success('Member deleted successfully');
      } catch (error) {
        console.error('Error deleting member:', error);
        toast.error(`Failed to delete member: ${getErrorMessage(error)}`);
      }
    }
  };

  const handleView = (member: Member) => {
    // Close other dialogs first to avoid state conflicts
    setShowIdCard(false);
    setShowEditDialog(false);
    setSelectedMember(member);
    setShowViewDialog(true);
  };

  const handleEdit = (member: Member) => {
    // Close other dialogs first to avoid state conflicts
    setShowIdCard(false);
    setShowViewDialog(false);
    setSelectedMember(member);
    setShowEditDialog(true);
  };

  const handleSaveEdit = async (updatedMember: Member) => {
    try {
      await updateMember(updatedMember.id, updatedMember);
      setMembers(members.map(m => m.id === updatedMember.id ? updatedMember : m));
      setShowEditDialog(false);
      setSelectedMember(null);
      toast.success('Member updated successfully');
    } catch (error) {
      console.error('Error updating member:', error);
      toast.error(`Failed to update member: ${getErrorMessage(error)}`);
    }
  };

  const handleAddMember = async (member: Member) => {
    try {
      const id = await createMember(member);
      setMembers([...members, { ...member, id }]);
      setShowAddModal(false);
      toast.success('Member added successfully');
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error(`Failed to add member: ${getErrorMessage(error)}`);
    }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="font-serif text-3xl font-bold text-gold-gradient">Members</h1>
          <p className="text-muted-foreground">Manage church members and their details</p>
        </div>
        <div className="flex gap-3">
          {hasPermission('members.export') && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  try {
                    let rows: Record<string, string>[];
                    const fileName = file.name.toLowerCase();

                    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                      const buffer = await file.arrayBuffer();
                      const workbook = XLSX.read(buffer, { type: 'array' });
                      const sheetName = workbook.SheetNames[0];
                      const sheet = workbook.Sheets[sheetName];
                      rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '', raw: false });
                    } else {
                      const text = await file.text();
                      rows = parseCsv(text);
                    }

                    if (rows.length === 0) {
                      toast.error('File has no data rows');
                      return;
                    }

                    const columns = Object.keys(rows[0]);
                    setImportFileColumns(columns);
                    setImportFileRows(rows);
                    setShowMapperDialog(true);
                  } catch (error) {
                    console.error('Import error:', error);
                    toast.error(`Failed to read file: ${getErrorMessage(error)}`);
                  } finally {
                    e.target.value = '';
                  }
                }}
              />

              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => importInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
                Import
              </Button>

              <Button
                size="sm"
                className="gap-2"
                onClick={() => {
                  const headers = [
                    'memberId','name','tamilName','dob','gender','phone',
                    'place','city','district','state','country','pincode',
                    'tamilPlace','tamilCity','tamilDistrict','tamilState',
                    'familyId','isHeadOfFamily','relationship',
                    'maritalStatus','anniversaryDate','baptismStatus','baptismDate',
                    'churchRole','team','status','expiredDate','remarks'
                  ];
                  const rows = members.map(m => [
                    m.memberId,
                    m.name,
                    m.tamilName || '',
                    m.dob,
                    m.gender,
                    m.phone,
                    m.address?.place || '',
                    m.address?.city || '',
                    m.address?.district || '',
                    m.address?.state || '',
                    m.address?.country || '',
                    m.address?.pincode || '',
                    m.tamilAddress?.place || '',
                    m.tamilAddress?.city || '',
                    m.tamilAddress?.district || '',
                    m.tamilAddress?.state || '',
                    m.familyId || m.memberId,
                    String(m.isHeadOfFamily ?? true),
                    m.relationship || 'Head',
                    m.maritalStatus,
                    m.anniversaryDate || '',
                    m.baptismStatus,
                    m.baptismDate || '',
                    m.churchRole,
                    m.team || '',
                    m.status,
                    m.expiredDate || '',
                    m.remarks || ''
                  ]);
                  downloadXlsx('members.xlsx', headers, rows);
                  toast.success('Export started');
                }}
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            </>
          )}
          {canCreate && (
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-primary hover:bg-primary/90">
                  <Plus className="w-4 h-4" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass">
                <DialogHeader>
                  <DialogTitle className="font-serif text-xl">Add New Member</DialogTitle>
                </DialogHeader>
                <MemberForm 
                  onSave={handleAddMember}
                  onCancel={() => setShowAddModal(false)}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="glass rounded-xl p-4 flex flex-col md:flex-row gap-4 animate-fade-in [animation-delay:100ms]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or member ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.trimStart())}
            onPaste={(e) => {
              e.preventDefault();
              const pasted = e.clipboardData.getData('text').trim();
              setSearchQuery(pasted);
            }}
            className="pl-10 bg-secondary/50 border-border/50"
          />
        </div>
        <Popover open={showFilters} onOpenChange={setShowFilters}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 relative">
              <Filter className="w-4 h-4" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-primary text-primary-foreground text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 glass" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Filter Members</h4>
                {activeFiltersCount > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={clearFilters}
                    className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Clear all
                  </Button>
                )}
              </div>
              
              {/* Team Filter */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Team</Label>
                <Select 
                  value={filters.team} 
                  onValueChange={(value) => setFilters(prev => ({ ...prev, team: value === 'all' ? '' : value }))}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="All Teams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Teams</SelectItem>
                    {teamStructure.map(group => (
                      <React.Fragment key={group.id}>
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

              {/* Gender Filter */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Gender</Label>
                <Select 
                  value={filters.gender} 
                  onValueChange={(value) => setFilters(prev => ({ ...prev, gender: value === 'all' ? '' : value }))}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="All Genders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genders</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Age Range Filter */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Age Range</Label>
                <Select 
                  value={filters.ageRange} 
                  onValueChange={(value) => setFilters(prev => ({ ...prev, ageRange: value === 'all' ? '' : value }))}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="All Ages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ages</SelectItem>
                    <SelectItem value="0-12">Children (0-12)</SelectItem>
                    <SelectItem value="13-19">Teens (13-19)</SelectItem>
                    <SelectItem value="20-35">Young Adults (20-35)</SelectItem>
                    <SelectItem value="36-50">Adults (36-50)</SelectItem>
                    <SelectItem value="51-65">Seniors (51-65)</SelectItem>
                    <SelectItem value="65+">Elders (65+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Church Role Filter */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Church Role</Label>
                <Select 
                  value={filters.churchRole} 
                  onValueChange={(value) => setFilters(prev => ({ ...prev, churchRole: value === 'all' ? '' : value }))}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="attendee">Attendee</SelectItem>
                    <SelectItem value="volunteer">Volunteer</SelectItem>
                    <SelectItem value="host">Host</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Member Status Filter */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Member Status</Label>
                <Select 
                  value={filters.memberStatus} 
                  onValueChange={(value) => setFilters(prev => ({ ...prev, memberStatus: value === 'all' ? '' : value }))}
                >
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
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                className="w-full" 
                onClick={() => setShowFilters(false)}
              >
                Apply Filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2 animate-fade-in">
          {filters.team && (
            <Badge variant="secondary" className="gap-1 pl-2">
              Team: {filters.team}
              <button onClick={() => setFilters(prev => ({ ...prev, team: '' }))} className="ml-1 hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.gender && (
            <Badge variant="secondary" className="gap-1 pl-2">
              Gender: {filters.gender}
              <button onClick={() => setFilters(prev => ({ ...prev, gender: '' }))} className="ml-1 hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.ageRange && (
            <Badge variant="secondary" className="gap-1 pl-2">
              Age: {filters.ageRange}
              <button onClick={() => setFilters(prev => ({ ...prev, ageRange: '' }))} className="ml-1 hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.churchRole && (
            <Badge variant="secondary" className="gap-1 pl-2">
              Role: {filters.churchRole}
              <button onClick={() => setFilters(prev => ({ ...prev, churchRole: '' }))} className="ml-1 hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.memberStatus && (
            <Badge variant="secondary" className="gap-1 pl-2 filter-badge-status capitalize">
              Status: {filters.memberStatus.replace('_', ' ')}
              <button onClick={() => setFilters(prev => ({ ...prev, memberStatus: '' }))} className="ml-1 hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Members Table - Grouped by Family */}
      <div className="glass rounded-xl overflow-hidden animate-fade-in [animation-delay:200ms]">
        {/* Expand/Collapse Controls */}
        <div className="flex justify-end gap-2 p-3 border-b border-border/30">
          <Button variant="ghost" size="sm" onClick={expandAllFamilies} className="text-xs">
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAllFamilies} className="text-xs">
            Collapse All
          </Button>
        </div>
        
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground w-10"></TableHead>
              <TableHead className="text-muted-foreground">Member ID</TableHead>
              <TableHead className="text-muted-foreground">Name</TableHead>
              <TableHead className="text-muted-foreground">Relationship</TableHead>
              <TableHead className="text-muted-foreground">Phone</TableHead>
              <TableHead className="text-muted-foreground">Team</TableHead>
              <TableHead className="text-muted-foreground">Tamil Address</TableHead>
              <TableHead className="text-muted-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  {members.length === 0 ? 'No members found. Add your first member!' : 'No members match your filters.'}
                </TableCell>
              </TableRow>
            ) : (
              groupedMembers.map((family) => {
                const isExpanded = expandedFamilies.has(family.familyId);
                const hasMultipleMembers = family.memberCount > 1;
                
                return (
                  <React.Fragment key={family.familyId}>
                    {/* Family Head Row */}
                    <TableRow 
                      className={`border-border/30 hover:bg-secondary/30 ${hasMultipleMembers ? 'cursor-pointer' : ''}`}
                      onClick={() => hasMultipleMembers && toggleFamilyExpansion(family.familyId)}
                    >
                      <TableCell className="w-10">
                        {hasMultipleMembers ? (
                          <div className="flex items-center gap-1">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                            <Badge variant="secondary" className="text-xs px-1.5">
                              <Users className="w-3 h-3 mr-1" />
                              {family.memberCount}
                            </Badge>
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-primary">
                        {family.head.memberId}
                      </TableCell>
                      <TableCell className="font-medium">
                        {family.head.name}
                        {family.head.isHeadOfFamily && (
                          <Badge variant="outline" className="ml-2 text-xs bg-primary/10 text-primary border-primary/20">
                            Head
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {family.head.relationship || 'Head'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{family.head.phone}</TableCell>
                      <TableCell>
                        {family.head.team && (
                          <Badge variant="outline" className="bg-secondary/50">
                            {family.head.team}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {[family.head.tamilAddress?.place, family.head.tamilAddress?.city, family.head.tamilAddress?.district]
                          .filter(Boolean).join(', ') || '—'}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => {
                              setSelectedMember(family.head);
                              setShowIdCard(true);
                            }}
                          >
                            <CreditCard className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => handleView(family.head)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-blue-400"
                              onClick={() => handleEdit(family.head)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(family.head.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    
                    {/* Family Members (Expandable) */}
                    {isExpanded && family.members
                      .filter(m => m.id !== family.head.id)
                      .map((member) => (
                        <TableRow 
                          key={member.id} 
                          className="border-border/30 bg-secondary/20 hover:bg-secondary/40"
                        >
                          <TableCell className="w-10">
                            <div className="ml-4 border-l-2 border-border/50 h-4" />
                          </TableCell>
                          <TableCell className="font-mono text-sm text-primary/80">
                            {member.memberId}
                          </TableCell>
                          <TableCell className="font-medium text-foreground/90">
                            {member.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {member.relationship || '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{member.phone}</TableCell>
                          <TableCell>
                            {member.team && (
                              <Badge variant="outline" className="bg-secondary/50">
                                {member.team}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {[member.tamilAddress?.place, member.tamilAddress?.city, member.tamilAddress?.district]
                              .filter(Boolean).join(', ') || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                onClick={() => {
                                  setSelectedMember(member);
                                  setShowIdCard(true);
                                }}
                              >
                                <CreditCard className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => handleView(member)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-blue-400"
                                  onClick={() => handleEdit(member)}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDelete(member.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ID Card Dialog */}
      <Dialog open={showIdCard} onOpenChange={setShowIdCard}>
        <DialogContent className="max-w-lg glass">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Member ID Card</DialogTitle>
          </DialogHeader>
          {selectedMember && <MemberIDCard member={selectedMember} />}
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <MemberViewDialog
        member={selectedMember}
        open={showViewDialog}
        onOpenChange={setShowViewDialog}
      />

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Edit Member</DialogTitle>
          </DialogHeader>
          {selectedMember && (
            <MemberForm 
              member={selectedMember}
              onSave={handleSaveEdit}
              onCancel={() => {
                setShowEditDialog(false);
                setSelectedMember(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Import Mapper Dialog */}
      <ImportMapperDialog
        open={showMapperDialog}
        onOpenChange={setShowMapperDialog}
        fileColumns={importFileColumns}
        previewRows={importFileRows}
        onConfirm={async (mapping) => {
          setShowMapperDialog(false);
          try {
            // Helper: treat N/A, empty, etc. as null
            const clean = (val: string | undefined): string => {
              const v = (val ?? '').trim();
              if (!v || v.toLowerCase() === 'n/a' || v.toLowerCase() === 'na' || v === '0000-00-00') return '';
              return v;
            };

            // Helper: parse dates in M/D/YY or various formats
            const parseExcelDate = (val: string | undefined): string => {
              const v = clean(val);
              if (!v) return '';
              // Try M/d/yy first (Excel format)
              const formats = ['M/d/yy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd/MM/yyyy', 'M/d/yyyy'];
              for (const fmt of formats) {
                const parsed = parse(v, fmt, new Date());
                if (isValid(parsed)) {
                  // For 2-digit years, date-fns interprets 00-49 as 2000s, 50-99 as 1900s
                  return parsed.toISOString().split('T')[0];
                }
              }
              return v; // Return as-is if no format matched
            };

            // Helper: normalize relationship with gender-aware correction
            const normalizeRelationship = (
              val: string, isHead: boolean, gender: 'male' | 'female',
              titleRaw: string, fellowshipRaw: string, marriedVal: string
            ): string => {
              const v = clean(val);
              // If head of family, always "Head"
              if (isHead) return 'Head';

              const map: Record<string, string> = {
                'wife': 'Wife', 'husband': 'Husband', 'son': 'Son', 'daughter': 'Daughter',
                'father': 'Father', 'mother': 'Mother', 'brother': 'Brother', 'sister': 'Sister',
                'grandson': 'Grandson', 'granddaughter': 'Granddaughter',
                'grandfather': 'Grandfather', 'grandmother': 'Grandmother',
                'son-in-law': 'Son-In-Law', 'daughter-in-law': 'Daughter-In-Law',
                'dependent': 'Dependent', 'other': 'Other',
              };

              let rel = v ? (map[v.toLowerCase()] || v.charAt(0).toUpperCase() + v.slice(1)) : '';

              // If relationship is empty/N/A for non-heads, infer from title/fellowship/gender
              if (!rel) {
                const title = titleRaw.toLowerCase();
                const fellowship = fellowshipRaw.toLowerCase();
                if (title === 'baby' || title === 'master' || fellowship === 'childrens') {
                  rel = gender === 'female' ? 'Daughter' : 'Son';
                } else if (title === 'mrs' && (fellowship === 'womens' || clean(marriedVal))) {
                  rel = 'Wife';
                } else if (title === 'mr' && (fellowship === 'mens' || clean(marriedVal))) {
                  rel = 'Husband';
                } else if (title === 'miss' || fellowship === 'girls') {
                  rel = 'Daughter';
                } else if (fellowship === 'boys') {
                  rel = 'Son';
                } else {
                  rel = gender === 'female' ? 'Wife' : 'Husband';
                }
              }
              
              // Fix gender/relationship mismatches
              if (gender === 'female') {
                const femaleCorrections: Record<string, string> = {
                  'Father': 'Mother', 'Husband': 'Wife', 'Son': 'Daughter',
                  'Brother': 'Sister', 'Grandson': 'Granddaughter', 'Grandfather': 'Grandmother',
                  'Son-In-Law': 'Daughter-In-Law',
                };
                if (femaleCorrections[rel]) rel = femaleCorrections[rel];
              }
              if (gender === 'male') {
                const maleCorrections: Record<string, string> = {
                  'Mother': 'Father', 'Wife': 'Husband', 'Daughter': 'Son',
                  'Sister': 'Brother', 'Granddaughter': 'Grandson', 'Grandmother': 'Grandfather',
                  'Daughter-In-Law': 'Son-In-Law',
                };
                if (maleCorrections[rel]) rel = maleCorrections[rel];
              }
              return rel;
            };

            // Remap rows using the user's column mapping
            const mappedRows = importFileRows.map(row => {
              const mapped: Record<string, string> = {};
              for (const [appField, fileCol] of Object.entries(mapping)) {
                mapped[appField] = (row[fileCol] ?? '').trim();
              }
              return mapped;
            });

            const required = ['name', 'dob', 'gender', 'phone'];
            const validRows = mappedRows.filter(r => {
              const name = clean(r.name);
              const gender = clean(r.gender);
              // DOB and phone can be N/A for some members, but name and gender are essential
              return name.length > 0 && gender.length > 0;
            });

            if (validRows.length === 0) {
              toast.error('No valid rows found after mapping (need at least name and gender)');
              return;
            }

            const existingMemberIds = new Set(members.map(m => m.memberId));
            const existingNumbers = members
              .map(m => m.memberId?.match(/IAG(\d+)/))
              .map(match => (match ? parseInt(match[1], 10) : 0))
              .filter(n => !isNaN(n));
            let nextNumber = (existingNumbers.length ? Math.max(...existingNumbers) : 0) + 1;

            let skippedDuplicates = 0;

            const results = await Promise.allSettled(
              validRows.map(async (r) => {
                const rawMemberId = clean(r.memberId);
                const memberId = rawMemberId || `IAG${String(nextNumber++).padStart(5, '0')}`;
                
                // Skip duplicates
                if (existingMemberIds.has(memberId)) {
                  skippedDuplicates++;
                  throw new Error(`Duplicate: ${memberId}`);
                }
                existingMemberIds.add(memberId);

                const familyId = clean(r.familyId) || memberId.split('-')[0];
                
                // Determine if head: from Member_Type column or by ID structure
                const memberTypeVal = clean(r.isHeadOfFamily).toLowerCase();
                const isHeadOfFamily = memberTypeVal === 'head' || memberTypeVal === 'true' || !memberId.includes('-');
                
                // Gender: trust the Gender column, but fix if Title contradicts
                const genderRaw = clean(r.gender).toLowerCase();
                const titleRaw = clean(r.title || '').toLowerCase();
                let gender: 'male' | 'female';
                // If gender/title conflict, trust Title (more reliable for names)
                if ((genderRaw === 'male' && (titleRaw === 'mrs' || titleRaw === 'miss')) ||
                    (genderRaw === 'female' && titleRaw === 'mr')) {
                  gender = titleRaw === 'mr' ? 'male' : 'female';
                } else {
                  gender = genderRaw === 'female' || genderRaw === 'f' ? 'female' : 'male';
                }
                
                const relationship = normalizeRelationship(
                  r.relationship, isHeadOfFamily, gender,
                  clean(r.title || ''), clean(r.fellowship || ''), r.anniversaryDate || ''
                );
                
                // DOB
                const dob = parseExcelDate(r.dob);
                
                // Phone: clean N/A
                const phone = clean(r.phone);
                
                // Anniversary / Married: if valid date → married, extract date
                const anniversaryRaw = parseExcelDate(r.anniversaryDate);
                const hasAnniversary = anniversaryRaw.length > 0;
                
                // Marital status: derive from married column or fellowship
                const fellowshipRaw = clean(r.fellowship).toLowerCase();
                let maritalStatus: 'single' | 'married' | 'widowed' | 'divorced' = 'single';
                if (hasAnniversary) {
                  maritalStatus = 'married';
                } else if (fellowshipRaw === 'womens' || fellowshipRaw === 'mens') {
                  maritalStatus = 'married';
                } else if (clean(r.maritalStatus)) {
                  const ms = clean(r.maritalStatus).toLowerCase();
                  if (ms === 'married') maritalStatus = 'married';
                  else if (ms === 'widowed') maritalStatus = 'widowed';
                  else if (ms === 'divorced') maritalStatus = 'divorced';
                }
                
                // Baptism: if Baptism/Communion column has a valid date → baptized
                const baptismDateRaw = parseExcelDate(r.baptismDate);
                const baptismStatus: 'baptized' | 'not_baptized' = baptismDateRaw ? 'baptized' : 'not_baptized';
                
                // Team: keep full zonal value as-is
                const teamRaw = clean(r.team);
                const team = teamRaw || 'Unassigned';
                
                // Status / Category
                const categoryRaw = clean(r.status).toLowerCase();
                let status: MemberStatus = 'regular';
                if (categoryRaw === 'occasional_visitor') status = 'occasional_visitor';
                else if (categoryRaw === 'out_station') status = 'out_of_station';
                else if (categoryRaw === 'dnd') status = 'do_not_disturb';
                else if (categoryRaw === 'left') status = 'left';
                else if (categoryRaw === 'long_absent') status = 'long_absent';
                else if (categoryRaw === 'expired') status = 'expired';
                
                // Tamil fields
                const tamilName = clean(r.tamilName) || undefined;
                const tamilAddressRaw = clean(r.tamilAddress) || undefined;

                const member: Member = {
                  id: crypto.randomUUID(),
                  memberId,
                  name: r.name ?? '',
                  tamilName,
                  dob,
                  gender,
                  phone,
                  address: {
                    place: clean(r.place),
                    city: clean(r.city),
                    district: clean(r.district),
                    state: clean(r.state),
                    country: clean(r.country) || 'India',
                    pincode: clean(r.pincode),
                  },
                  tamilAddress: tamilAddressRaw ? { place: tamilAddressRaw } : undefined,
                  familyId,
                  isHeadOfFamily,
                  relationship: relationship as any,
                  maritalStatus,
                  anniversaryDate: hasAnniversary ? anniversaryRaw : undefined,
                  baptismStatus,
                  baptismDate: baptismDateRaw || undefined,
                  churchRole: 'attendee',
                  team,
                  status,
                  remarks: clean(r.remarks) || undefined,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                const id = await createMember(member);
                return { ...member, id } as Member;
              })
            );

            const succeeded = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<Member>[];
            const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
            const actualFailures = failed.length - skippedDuplicates;

            if (succeeded.length) {
              setMembers(prev => [...prev, ...succeeded.map(s => s.value)]);
            }

            let msg = `Imported ${succeeded.length} members`;
            if (skippedDuplicates > 0) msg += `, ${skippedDuplicates} duplicates skipped`;
            if (actualFailures > 0) msg += `, ${actualFailures} failed`;
            
            if (actualFailures > 0) {
              console.error('Import failures:', failed.map(f => f.reason));
              toast.error(msg);
            } else {
              toast.success(msg);
            }
          } catch (error) {
            console.error('Import error:', error);
            toast.error(`Import failed: ${getErrorMessage(error)}`);
          }
        }}
      />
    </div>
  );
};

export default Members;
