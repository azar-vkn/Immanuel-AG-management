import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Member } from '@/types';
import { transliterateToTamil } from '@/lib/tamilTransliterate';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
import { Download, Cake, Gift, PartyPopper, CalendarRange } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { toast } from 'sonner';

interface CelebrationReportProps {
  members: Member[];
}

type CelebrationType = 'all' | 'birthday' | 'anniversary';

interface CelebrationEntry {
  member: Member;
  type: 'Birthday' | 'Anniversary';
  date: string;
  displayDate: string;
  sortDate: Date;
}

const safeParseDate = (dateValue: string | { seconds: number } | null | undefined): Date | null => {
  if (!dateValue) return null;
  try {
    let d: Date;
    if (typeof dateValue === 'object' && 'seconds' in dateValue) {
      d = new Date(dateValue.seconds * 1000);
    } else {
      d = new Date(dateValue);
    }
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
};

export const CelebrationReport: React.FC<CelebrationReportProps> = ({ members }) => {
  // Default: current week (Sunday to Saturday)
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const [fromDate, setFromDate] = useState(format(startOfWeek, 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(endOfWeek, 'yyyy-MM-dd'));
  const [celebrationType, setCelebrationType] = useState<CelebrationType>('all');

  const celebrations = useMemo(() => {
    if (!fromDate || !toDate) return [];

    // Parse as local dates to avoid UTC timezone offset issues
    // new Date('yyyy-MM-dd') parses as UTC midnight, which shifts ahead in IST
    const [fy, fm, fd] = fromDate.split('-').map(Number);
    const [ty, tm, td] = toDate.split('-').map(Number);
    const from = new Date(fy, fm - 1, fd);
    const to = new Date(ty, tm - 1, td);
    if (!isValid(from) || !isValid(to)) return [];

    const year = from.getFullYear();
    const entries: CelebrationEntry[] = [];

    // Only include non-expired members
    const activeMembers = members.filter(m => m.status !== 'expired');

    activeMembers.forEach(member => {
      // Check birthdays
      if (celebrationType !== 'anniversary') {
        const dob = safeParseDate(member.dob);
        if (dob) {
          // Check the date in the current year context of the range
          // We need to handle ranges that span year boundaries
          const yearsToCheck = [year];
          if (to.getFullYear() !== year) {
            yearsToCheck.push(to.getFullYear());
          }
          
          for (const y of yearsToCheck) {
            const dobThisYear = new Date(y, dob.getMonth(), dob.getDate());
            if (dobThisYear >= from && dobThisYear <= to) {
              entries.push({
                member,
                type: 'Birthday',
                date: member.dob,
                displayDate: format(dobThisYear, 'MMM dd'),
                sortDate: dobThisYear,
              });
              break;
            }
          }
        }
      }

      // Check anniversaries
      if (celebrationType !== 'birthday') {
        const anniv = safeParseDate(member.anniversaryDate);
        if (anniv) {
          const yearsToCheck = [year];
          if (to.getFullYear() !== year) {
            yearsToCheck.push(to.getFullYear());
          }

          for (const y of yearsToCheck) {
            const annivThisYear = new Date(y, anniv.getMonth(), anniv.getDate());
            if (annivThisYear >= from && annivThisYear <= to) {
              entries.push({
                member,
                type: 'Anniversary',
                date: member.anniversaryDate || '',
                displayDate: format(annivThisYear, 'MMM dd'),
                sortDate: annivThisYear,
              });
              break;
            }
          }
        }
      }
    });

    // Sort by celebration date (chronological order)
    entries.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

    return entries;
  }, [members, fromDate, toDate, celebrationType]);

  const birthdayCount = celebrations.filter(c => c.type === 'Birthday').length;
  const anniversaryCount = celebrations.filter(c => c.type === 'Anniversary').length;

  const handleExport = () => {
    if (celebrations.length === 0) {
      toast.error('No celebrations to export');
      return;
    }

    const BOM = "\uFEFF";
    const headers = [
      'Member ID', 'Name', 'Tamil Name', 'Phone', 'Place', 'Tamil Place', 'Event Type', 'Date', 'Member Status'
    ];

    const rows = celebrations.map(c => [
      c.member.memberId,
      c.member.name,
      c.member.tamilName || transliterateToTamil(c.member.name),
      c.member.phone,
      c.member.address?.place || '',
      c.member.tamilAddress?.place || (c.member.address?.place ? transliterateToTamil(c.member.address.place) : ''),
      c.type,
      c.date,
      (c.member.status || 'regular').replace(/_/g, ' '),
    ]);

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Celebrations');
    XLSX.writeFile(wb, `Celebrations_${fromDate}_to_${toDate}.xlsx`);
    toast.success(`Exported ${celebrations.length} celebrations`);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="glass rounded-xl p-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <Label>From Date</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-secondary/50"
            />
          </div>

          <div className="space-y-2">
            <Label>To Date</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-secondary/50"
            />
          </div>

          <div className="space-y-2">
            <Label>Celebration Type</Label>
            <Select value={celebrationType} onValueChange={(v) => setCelebrationType(v as CelebrationType)}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <PartyPopper className="w-4 h-4" />
                    All Celebrations
                  </div>
                </SelectItem>
                <SelectItem value="birthday">
                  <div className="flex items-center gap-2">
                    <Cake className="w-4 h-4 text-pink-400" />
                    Birthdays Only
                  </div>
                </SelectItem>
                <SelectItem value="anniversary">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-purple-400" />
                    Anniversaries Only
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              onClick={handleExport}
              disabled={celebrations.length === 0}
              className="w-full gap-2 bg-primary hover:bg-primary/90"
            >
              <Download className="w-4 h-4" />
              Export Report
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-foreground">{celebrations.length}</p>
          <p className="text-sm text-muted-foreground">Total Celebrations</p>
        </div>
        <div className="glass rounded-xl p-4 text-center border-pink-500/30">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Cake className="w-5 h-5 text-pink-400" />
            <p className="text-3xl font-bold text-pink-400">{birthdayCount}</p>
          </div>
          <p className="text-sm text-muted-foreground">Birthdays</p>
        </div>
        <div className="glass rounded-xl p-4 text-center border-purple-500/30">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Gift className="w-5 h-5 text-purple-400" />
            <p className="text-3xl font-bold text-purple-400">{anniversaryCount}</p>
          </div>
          <p className="text-sm text-muted-foreground">Anniversaries</p>
        </div>
      </div>

      {/* Report Table */}
      <div className="glass rounded-xl overflow-hidden animate-fade-in">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground">Member ID</TableHead>
              <TableHead className="text-muted-foreground">Name</TableHead>
              <TableHead className="text-muted-foreground">Phone</TableHead>
              <TableHead className="text-muted-foreground">Place</TableHead>
              <TableHead className="text-muted-foreground">Type</TableHead>
              <TableHead className="text-muted-foreground">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {celebrations.map((entry, index) => (
              <TableRow key={`${entry.member.id}-${entry.type}-${index}`} className="border-border/30 hover:bg-secondary/30">
                <TableCell className="font-mono text-sm text-primary">
                  {entry.member.memberId}
                </TableCell>
                <TableCell className="font-medium">{entry.member.name}</TableCell>
                <TableCell className="text-muted-foreground">{entry.member.phone}</TableCell>
                <TableCell className="text-muted-foreground">
                  {entry.member.address?.place || '-'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      entry.type === 'Birthday'
                        ? 'bg-pink-500/20 text-pink-400 border-pink-500/30'
                        : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                    }
                  >
                    {entry.type === 'Birthday' ? (
                      <Cake className="w-3 h-3 mr-1" />
                    ) : (
                      <Gift className="w-3 h-3 mr-1" />
                    )}
                    {entry.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm px-2 py-1 rounded-full bg-primary/10 text-primary">
                    {entry.displayDate}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {celebrations.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <CalendarRange className="w-12 h-12 mx-auto mb-4 opacity-50" />
            No celebrations found for the selected date range.
          </div>
        )}
      </div>
    </div>
  );
};
