import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Member } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, ScanFace, CheckCircle2, Users, Download } from 'lucide-react';

/** "long_absent" -> "Long Absent", so the export reads as a report, not as data. */
const formatStatus = (status?: string): string =>
  (status ?? '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

interface FaceRosterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  members: Member[];
  /** Shown as a green tick row (registered) rather than an action row. */
  variant: 'registered' | 'unregistered';
  /** Omitted when the viewer lacks permission to register faces. */
  onRegister?: (member: Member) => void;
  /**
   * Resolves a member's family head name. Supplied by the page, which holds the
   * whole roster — a head often sits outside this dialog's filtered subset, so
   * it cannot be looked up from `members` alone.
   */
  familyHeadFor?: (member: Member) => string;
  /** Base name for the exported file, e.g. "registered-faces". */
  exportFileName?: string;
}

/**
 * Shared roster list behind the Face Configuration stat cards: who has face data
 * and who doesn't, with a direct route into registration for the ones who
 * don't. Searchable because a church roster runs to hundreds of members.
 */
export const FaceRosterDialog: React.FC<FaceRosterDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  members,
  variant,
  onRegister,
  familyHeadFor,
  exportFileName = 'face-roster',
}) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.tamilName ?? '').toLowerCase().includes(q) ||
        m.memberId.toLowerCase().includes(q) ||
        (m.phone ?? '').includes(q),
    );
  }, [members, search]);

  /**
   * Export exactly what is on screen, so a search-narrowed list exports
   * narrowed. The row count under the list says how many that is.
   */
  const handleExport = () => {
    const headers = ['Member ID', 'Name', 'Family Head', 'Member Status'];
    const rows = filtered.map((m) => [
      m.memberId ?? '',
      m.name ?? '',
      familyHeadFor ? familyHeadFor(m) : '',
      formatStatus(m.status),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 28 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${exportFileName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif">
            {variant === 'registered' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : (
              <Users className="w-5 h-5 text-amber-500" />
            )}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, member ID or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-10">
              {members.length === 0
                ? variant === 'registered'
                  ? 'No members have face data yet.'
                  : 'Every member has face data registered.'
                : 'No members match that search.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-secondary/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.memberId}
                      {member.team ? ` · ${member.team}` : ''}
                      {member.phone ? ` · ${member.phone}` : ''}
                    </p>
                  </div>

                  {variant === 'registered' ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Registered
                      </Badge>
                      {onRegister && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => onRegister(member)}
                        >
                          Update
                        </Button>
                      )}
                    </div>
                  ) : onRegister ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 flex-shrink-0"
                      onClick={() => onRegister(member)}
                    >
                      <ScanFace className="w-3.5 h-3.5" />
                      Register Face
                    </Button>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground flex-shrink-0">
                      Not registered
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {members.length}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export XLSX
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
