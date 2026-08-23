import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Member, Attendance } from '@/types';
import { transliterateToTamil } from '@/lib/tamilTransliterate';
import { differenceInYears } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserCheck, UserX, Download, ChevronDown, ChevronUp } from 'lucide-react';

interface FellowshipReportProps {
  members: Member[];
  attendance: Attendance[];
  selectedEventId: string;
  eventName?: string;
}

type FellowshipCategory = 
  | 'Children'
  | 'Youth Boys Fellowship'
  | 'Youth Girls Fellowship'
  | "Men's Fellowship"
  | "Women's Fellowship";

const getCategoryForMember = (member: Member): FellowshipCategory => {
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

const CATEGORY_ORDER: FellowshipCategory[] = [
  'Children',
  'Youth Boys Fellowship',
  'Youth Girls Fellowship',
  "Men's Fellowship",
  "Women's Fellowship",
];

const CATEGORY_COLORS: Record<FellowshipCategory, string> = {
  'Children': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Youth Boys Fellowship': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Youth Girls Fellowship': 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  "Men's Fellowship": 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  "Women's Fellowship": 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

const MemberTable: React.FC<{ members: Member[] }> = ({ members }) => {
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No members</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50 hover:bg-transparent">
          <TableHead className="text-muted-foreground text-xs">S.No</TableHead>
          <TableHead className="text-muted-foreground text-xs">Member ID</TableHead>
          <TableHead className="text-muted-foreground text-xs">Name</TableHead>
          <TableHead className="text-muted-foreground text-xs">Phone</TableHead>
          <TableHead className="text-muted-foreground text-xs">Team</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m, idx) => (
          <TableRow key={m.id} className="border-border/30 hover:bg-secondary/30">
            <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
            <TableCell className="font-mono text-sm text-primary">{m.memberId}</TableCell>
            <TableCell className="font-medium text-sm">{m.name}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{m.phone}</TableCell>
            <TableCell>
              {m.team && (
                <Badge variant="outline" className="bg-secondary/50 text-xs">{m.team}</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export const FellowshipReport: React.FC<FellowshipReportProps> = ({
  members,
  attendance,
  selectedEventId,
  eventName,
}) => {
  const [expandedCategory, setExpandedCategory] = useState<FellowshipCategory | null>(null);

  const data = useMemo(() => {
    const presentIds = new Set(
      attendance.filter(a => a.eventId === selectedEventId).map(a => a.memberId)
    );
    const categories: Record<FellowshipCategory, { present: Member[]; absent: Member[] }> = {
      'Children': { present: [], absent: [] },
      'Youth Boys Fellowship': { present: [], absent: [] },
      'Youth Girls Fellowship': { present: [], absent: [] },
      "Men's Fellowship": { present: [], absent: [] },
      "Women's Fellowship": { present: [], absent: [] },
    };
    members.forEach(m => {
      const cat = getCategoryForMember(m);
      if (presentIds.has(m.id)) {
        categories[cat].present.push(m);
      } else {
        categories[cat].absent.push(m);
      }
    });
    return categories;
  }, [members, attendance, selectedEventId]);

  const totalPresent = Object.values(data).reduce((s, c) => s + c.present.length, 0);
  const totalAbsent = Object.values(data).reduce((s, c) => s + c.absent.length, 0);

  const handleExport = () => {
    const BOM = "\uFEFF";
    const headers = ['Fellowship', 'Member ID', 'Name', 'Tamil Name', 'Phone', 'Tamil Place', 'Team', 'Member Status', 'Attendance', 'Report'];
    const rows: string[][] = [];
    CATEGORY_ORDER.forEach(cat => {
      data[cat].present.forEach(m => {
        rows.push([cat, m.memberId, m.name, m.tamilName || transliterateToTamil(m.name), m.phone, m.tamilAddress?.place || (m.address?.place ? transliterateToTamil(m.address.place) : ''), m.team || '-', (m.status || 'regular').replace(/_/g, ' '), 'Present', '']);
      });
      data[cat].absent.forEach(m => {
        rows.push([cat, m.memberId, m.name, m.tamilName || transliterateToTamil(m.name), m.phone, m.tamilAddress?.place || (m.address?.place ? transliterateToTamil(m.address.place) : ''), m.team || '-', (m.status || 'regular').replace(/_/g, ' '), 'Absent', '']);
      });
    });
    rows.push([]);
    rows.push(['Fellowship', 'Total', 'Present', 'Absent', 'Attendance %', '', '', '', '', '']);
    CATEGORY_ORDER.forEach(cat => {
      const total = data[cat].present.length + data[cat].absent.length;
      const pct = total > 0 ? Math.round((data[cat].present.length / total) * 100) : 0;
      rows.push([cat, String(total), String(data[cat].present.length), String(data[cat].absent.length), `${pct}%`, '', '', '', '', '']);
    });
    rows.push(['Total', String(members.length), String(totalPresent), String(totalAbsent), `${members.length > 0 ? Math.round((totalPresent / members.length) * 100) : 0}%`, '', '', '', '', '']);
    
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fellowship Report');
    XLSX.writeFile(wb, `fellowship-report-${eventName || selectedEventId}.xlsx`);
  };

  const handleExportCategory = (cat: FellowshipCategory, type: 'present' | 'absent' | 'all') => {
    const BOM = "\uFEFF";
    const { present, absent } = data[cat];
    const headers = ['S.No', 'Member ID', 'Name', 'Tamil Name', 'Phone', 'Tamil Place', 'Team', 'Member Status', 'Report'];
    const list = type === 'present' ? present : type === 'absent' ? absent : [...present, ...absent];
    const statusLabel = type === 'present' ? 'Participants' : type === 'absent' ? 'Absentees' : 'All';
    const rows = list.map((m, idx) => [String(idx + 1), m.memberId, m.name, m.tamilName || transliterateToTamil(m.name), m.phone, m.tamilAddress?.place || (m.address?.place ? transliterateToTamil(m.address.place) : ''), m.team || '-', (m.status || 'regular').replace(/_/g, ' '), '']);
    
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, statusLabel);
    XLSX.writeFile(wb, `${cat}-${statusLabel}-${eventName || selectedEventId}.xlsx`);
  };

  const toggleCategory = (cat: FellowshipCategory) => {
    setExpandedCategory(prev => prev === cat ? null : cat);
  };

  return (
    <div className="space-y-6 animate-fade-in [animation-delay:200ms]">
      {/* Export Button */}
      <div className="flex justify-end mb-4">
        <Button onClick={handleExport} className="gap-2 bg-primary hover:bg-primary/90">
          <Download className="w-4 h-4" />
          Export Fellowship Report
        </Button>
      </div>

      {/* Category Cards */}
      <div className="space-y-4">
        {CATEGORY_ORDER.map(cat => {
          const { present, absent } = data[cat];
          const total = present.length + absent.length;
          const pct = total > 0 ? Math.round((present.length / total) * 100) : 0;
          const isExpanded = expandedCategory === cat;

          return (
            <div key={cat} className={`glass rounded-xl border overflow-hidden ${CATEGORY_COLORS[cat]}`}>
              {/* Card Header - clickable */}
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full p-5 flex items-center justify-between text-left transition-colors hover:bg-secondary/10"
              >
                <div className="flex items-center gap-4">
                  <h3 className="font-serif font-semibold text-base">{cat}</h3>
                  <span className="text-xs font-medium opacity-80">{total} members</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-bold text-foreground">{present.length}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <UserX className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-bold text-foreground">{absent.length}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="border-t border-border/30 p-4 animate-fade-in">
                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-secondary/50 mb-4">
                    <div
                      className="h-2 rounded-full bg-current transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <Tabs defaultValue="participants" className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <TabsList className="bg-secondary/50">
                        <TabsTrigger value="participants" className="gap-1.5">
                          <UserCheck className="w-3.5 h-3.5" />
                          Participants ({present.length})
                        </TabsTrigger>
                        <TabsTrigger value="absentees" className="gap-1.5">
                          <UserX className="w-3.5 h-3.5" />
                          Absentees ({absent.length})
                        </TabsTrigger>
                      </TabsList>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleExportCategory(cat, 'present')} className="gap-1.5 text-xs">
                          <Download className="w-3.5 h-3.5" />
                          Export Participants
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleExportCategory(cat, 'absent')} className="gap-1.5 text-xs">
                          <Download className="w-3.5 h-3.5" />
                          Export Absentees
                        </Button>
                      </div>
                    </div>

                    <TabsContent value="participants">
                      <div className="glass rounded-lg overflow-hidden">
                        <MemberTable members={present} />
                      </div>
                    </TabsContent>

                    <TabsContent value="absentees">
                      <div className="glass rounded-lg overflow-hidden">
                        <MemberTable members={absent} />
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
