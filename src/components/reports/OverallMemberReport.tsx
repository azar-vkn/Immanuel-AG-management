import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Member } from '@/types';
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
import { Download, ChevronDown, ChevronUp, Users, Filter } from 'lucide-react';

interface OverallMemberReportProps {
  members: Member[];
}

type FellowshipCategory = 
  | 'Children'
  | 'Youth Boys Fellowship'
  | 'Youth Girls Fellowship'
  | "Men's Fellowship"
  | "Women's Fellowship";

const getCategoryForMember = (member: Member): FellowshipCategory => {
  if (member.fellowship) return member.fellowship as FellowshipCategory;
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
          <TableHead className="text-muted-foreground text-xs">Status</TableHead>
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
            <TableCell>
              <Badge variant="outline" className="capitalize text-xs">
                {m.status?.replace('_', ' ') || 'Active'}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

type ExportVariation = 
  | 'baptized'
  | 'not_baptized'
  | 'married'
  | 'single'
  | 'widowed_divorced'
  | 'male'
  | 'female'
  | 'volunteer'
  | 'host'
  | 'operator';

const EXPORT_VARIATIONS: { key: ExportVariation; label: string; group: string }[] = [
  { key: 'baptized', label: 'Baptized', group: 'Baptism' },
  { key: 'not_baptized', label: 'Not Baptized', group: 'Baptism' },
  { key: 'married', label: 'Married', group: 'Marital Status' },
  { key: 'single', label: 'Single', group: 'Marital Status' },
  { key: 'widowed_divorced', label: 'Widowed / Divorced', group: 'Marital Status' },
  { key: 'male', label: 'Male', group: 'Gender' },
  { key: 'female', label: 'Female', group: 'Gender' },
  { key: 'volunteer', label: 'Volunteer', group: 'Church Role' },
  { key: 'host', label: 'Host', group: 'Church Role' },
  { key: 'operator', label: 'Operator', group: 'Church Role' },
];

const VARIATION_GROUP_COLORS: Record<string, string> = {
  'Baptism': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  'Marital Status': 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  'Gender': 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  'Church Role': 'bg-teal-500/15 text-teal-400 border-teal-500/30',
};

const applyVariationFilter = (membersList: Member[], variations: Set<ExportVariation>): Member[] => {
  if (variations.size === 0) return membersList;
  
  return membersList.filter(m => {
    // Group variations by category — within each group it's OR, across groups it's AND
    const baptismVariations = [...variations].filter(v => v === 'baptized' || v === 'not_baptized');
    const maritalVariations = [...variations].filter(v => v === 'married' || v === 'single' || v === 'widowed_divorced');
    const genderVariations = [...variations].filter(v => v === 'male' || v === 'female');
    const roleVariations = [...variations].filter(v => v === 'volunteer' || v === 'host' || v === 'operator');

    let pass = true;

    if (baptismVariations.length > 0) {
      const baptismMatch = baptismVariations.some(v => {
        if (v === 'baptized') return m.baptismStatus === 'baptized';
        if (v === 'not_baptized') return m.baptismStatus === 'not_baptized' || !m.baptismStatus;
        return false;
      });
      if (!baptismMatch) pass = false;
    }

    if (maritalVariations.length > 0) {
      const maritalMatch = maritalVariations.some(v => {
        if (v === 'married') return m.maritalStatus === 'married';
        if (v === 'single') return m.maritalStatus === 'single';
        if (v === 'widowed_divorced') return m.maritalStatus === 'widowed' || m.maritalStatus === 'divorced';
        return false;
      });
      if (!maritalMatch) pass = false;
    }

    if (genderVariations.length > 0) {
      const genderMatch = genderVariations.some(v => {
        if (v === 'male') return m.gender === 'male';
        if (v === 'female') return m.gender === 'female';
        return false;
      });
      if (!genderMatch) pass = false;
    }

    if (roleVariations.length > 0) {
      const roleMatch = roleVariations.some(v => {
        if (v === 'volunteer') return m.churchRole === 'volunteer';
        if (v === 'host') return m.churchRole === 'host';
        if (v === 'operator') return m.churchRole === 'operator';
        return false;
      });
      if (!roleMatch) pass = false;
    }

    return pass;
  });
};

export const OverallMemberReport: React.FC<OverallMemberReportProps> = ({ members }) => {
  const [expandedCategory, setExpandedCategory] = useState<FellowshipCategory | null>(null);
  const [selectedCategoriesToExport, setSelectedCategoriesToExport] = useState<Set<FellowshipCategory>>(new Set());
  const [selectedVariations, setSelectedVariations] = useState<Set<ExportVariation>>(new Set());

  const data = useMemo(() => {
    const categories: Record<FellowshipCategory, Member[]> = {
      'Children': [],
      'Youth Boys Fellowship': [],
      'Youth Girls Fellowship': [],
      "Men's Fellowship": [],
      "Women's Fellowship": [],
    };
    members.forEach(m => {
      // Exclude expired members from overall general reports unless we want them? Let's just include all passed in 'members'
      const cat = getCategoryForMember(m);
      if (categories[cat]) {
        categories[cat].push(m);
      }
    });
    return categories;
  }, [members]);

  const toggleExportCategory = (cat: FellowshipCategory) => {
    setSelectedCategoriesToExport(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleVariation = (variation: ExportVariation) => {
    setSelectedVariations(prev => {
      const next = new Set(prev);
      if (next.has(variation)) next.delete(variation);
      else next.add(variation);
      return next;
    });
  };

  const clearVariations = () => {
    setSelectedVariations(new Set());
  };

  const handleExportSelected = () => {
    const BOM = "\uFEFF";
    const headers = ['Fellowship', 'Member ID', 'Name', 'Tamil Name', 'Phone', 'Tamil Place', 'Team', 'Status'];
    // Add variation-specific columns when variations are selected
    if (selectedVariations.size > 0) {
      const hasBaptismVar = [...selectedVariations].some(v => v === 'baptized' || v === 'not_baptized');
      const hasMaritalVar = [...selectedVariations].some(v => v === 'married' || v === 'single' || v === 'widowed_divorced');
      const hasRoleVar = [...selectedVariations].some(v => v === 'volunteer' || v === 'host' || v === 'operator');
      if (hasBaptismVar) headers.push('Baptism Status');
      if (hasMaritalVar) headers.push('Marital Status');
      if (hasRoleVar) headers.push('Church Role');
    }
    const rows: string[][] = [];
    
    const catsToExport = selectedCategoriesToExport.size > 0 
      ? CATEGORY_ORDER.filter(c => selectedCategoriesToExport.has(c)) 
      : CATEGORY_ORDER;

    let totalExported = 0;

    catsToExport.forEach(cat => {
      const filteredMembers = applyVariationFilter(data[cat], selectedVariations);
      filteredMembers.forEach(m => {
        const row = [
          cat, 
          m.memberId, 
          m.name, 
          m.tamilName || transliterateToTamil(m.name), 
          m.phone, 
          m.tamilAddress?.place || (m.address?.place ? transliterateToTamil(m.address.place) : ''), 
          m.team || '-', 
          m.status || 'active'
        ];
        // Add variation-specific values
        if (selectedVariations.size > 0) {
          const hasBaptismVar = [...selectedVariations].some(v => v === 'baptized' || v === 'not_baptized');
          const hasMaritalVar = [...selectedVariations].some(v => v === 'married' || v === 'single' || v === 'widowed_divorced');
          const hasRoleVar = [...selectedVariations].some(v => v === 'volunteer' || v === 'host' || v === 'operator');
          if (hasBaptismVar) row.push(m.baptismStatus === 'baptized' ? 'Baptized' : 'Not Baptized');
          if (hasMaritalVar) row.push((m.maritalStatus || 'single').replace('_', ' '));
          if (hasRoleVar) row.push((m.churchRole || 'attendee').replace('_', ' '));
        }
        rows.push(row);
      });
      totalExported += filteredMembers.length;
    });
    
    rows.push([]);
    rows.push(['Fellowship', 'Total', '', '', '', '', '', '']);
    catsToExport.forEach(cat => {
      const filteredCount = applyVariationFilter(data[cat], selectedVariations).length;
      rows.push([cat, String(filteredCount), '', '', '', '', '', '']);
    });
    rows.push(['Total Exported', String(totalExported), '', '', '', '', '', '']);
    
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Members');
    
    // Build descriptive filename
    const variationLabels = [...selectedVariations].map(v => 
      EXPORT_VARIATIONS.find(ev => ev.key === v)?.label || v
    ).join('-');
    let exportName = '';
    if (selectedCategoriesToExport.size > 0 && selectedVariations.size > 0) {
      exportName = `filtered-members-${variationLabels}.xlsx`;
    } else if (selectedCategoriesToExport.size > 0) {
      exportName = `selected-members-report.xlsx`;
    } else if (selectedVariations.size > 0) {
      exportName = `all-members-${variationLabels}.xlsx`;
    } else {
      exportName = `overall-member-report.xlsx`;
    }
    XLSX.writeFile(wb, exportName);
  };

  const handleExportCategory = (cat: FellowshipCategory) => {
    const BOM = "\uFEFF";
    const list = applyVariationFilter(data[cat], selectedVariations);
    const headers = ['S.No', 'Member ID', 'Name', 'Tamil Name', 'Phone', 'Tamil Place', 'Team', 'Status'];
    if (selectedVariations.size > 0) {
      const hasBaptismVar = [...selectedVariations].some(v => v === 'baptized' || v === 'not_baptized');
      const hasMaritalVar = [...selectedVariations].some(v => v === 'married' || v === 'single' || v === 'widowed_divorced');
      const hasRoleVar = [...selectedVariations].some(v => v === 'volunteer' || v === 'host' || v === 'operator');
      if (hasBaptismVar) headers.push('Baptism Status');
      if (hasMaritalVar) headers.push('Marital Status');
      if (hasRoleVar) headers.push('Church Role');
    }
    const rows = list.map((m, idx) => {
      const row = [
        String(idx + 1), 
        m.memberId, 
        m.name, 
        m.tamilName || transliterateToTamil(m.name), 
        m.phone, 
        m.tamilAddress?.place || (m.address?.place ? transliterateToTamil(m.address.place) : ''), 
        m.team || '-', 
        m.status || 'active'
      ];
      if (selectedVariations.size > 0) {
        const hasBaptismVar = [...selectedVariations].some(v => v === 'baptized' || v === 'not_baptized');
        const hasMaritalVar = [...selectedVariations].some(v => v === 'married' || v === 'single' || v === 'widowed_divorced');
        const hasRoleVar = [...selectedVariations].some(v => v === 'volunteer' || v === 'host' || v === 'operator');
        if (hasBaptismVar) row.push(m.baptismStatus === 'baptized' ? 'Baptized' : 'Not Baptized');
        if (hasMaritalVar) row.push((m.maritalStatus || 'single').replace('_', ' '));
        if (hasRoleVar) row.push((m.churchRole || 'attendee').replace('_', ' '));
      }
      return row;
    });
    
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cat);
    const variationLabels = selectedVariations.size > 0 
      ? '-' + [...selectedVariations].map(v => EXPORT_VARIATIONS.find(ev => ev.key === v)?.label || v).join('-')
      : '';
    XLSX.writeFile(wb, `${cat}${variationLabels}-report.xlsx`);
  };

  const toggleCategory = (cat: FellowshipCategory) => {
    setExpandedCategory(prev => prev === cat ? null : cat);
  };

  return (
    <div className="space-y-6 animate-fade-in [animation-delay:100ms]">
      <div className="flex flex-col gap-4 p-4 glass rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Select categories to export together:</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_ORDER.map(cat => (
                <Badge 
                  key={cat}
                  variant={selectedCategoriesToExport.has(cat) ? 'default' : 'outline'}
                  className={`cursor-pointer transition-colors ${selectedCategoriesToExport.has(cat) ? '' : 'hover:bg-secondary/50'}`}
                  onClick={() => toggleExportCategory(cat)}
                >
                  {cat}
                </Badge>
              ))}
            </div>
          </div>
          <Button onClick={handleExportSelected} className="gap-2 bg-primary hover:bg-primary/90 whitespace-nowrap">
            <Download className="w-4 h-4" />
            {selectedCategoriesToExport.size > 0 || selectedVariations.size > 0 
              ? `Export Filtered` 
              : 'Export All Categories'}
          </Button>
        </div>

        {/* Export Variation Filters */}
        <div className="border-t border-border/30 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Export Variations (optional filter):</p>
            </div>
            {selectedVariations.size > 0 && (
              <button 
                onClick={clearVariations}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
              >
                Clear all filters
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            {Object.entries(
              EXPORT_VARIATIONS.reduce((acc, v) => {
                if (!acc[v.group]) acc[v.group] = [];
                acc[v.group].push(v);
                return acc;
              }, {} as Record<string, typeof EXPORT_VARIATIONS>)
            ).map(([group, variations]) => (
              <div key={group} className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {variations.map(v => (
                    <Badge
                      key={v.key}
                      variant={selectedVariations.has(v.key) ? 'default' : 'outline'}
                      className={`cursor-pointer transition-all text-xs ${
                        selectedVariations.has(v.key) 
                          ? VARIATION_GROUP_COLORS[group] + ' border font-medium'
                          : 'hover:bg-secondary/50'
                      }`}
                      onClick={() => toggleVariation(v.key)}
                    >
                      {v.label}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {selectedVariations.size > 0 && (
            <p className="text-xs text-muted-foreground italic">
              📋 Filters active: exports will only include members matching the selected criteria
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORY_ORDER.map(cat => (
          <div key={cat} className={`glass rounded-xl p-4 text-center border ${CATEGORY_COLORS[cat]}`}>
            <p className="text-3xl font-bold">{data[cat].length}</p>
            <p className="text-sm font-medium">{cat}</p>
          </div>
        ))}
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-foreground">{members.length}</p>
          <p className="text-sm text-muted-foreground">Total Members</p>
        </div>
      </div>

      <div className="space-y-4 mt-6">
        {CATEGORY_ORDER.map(cat => {
          const list = data[cat];
          const total = list.length;
          const isExpanded = expandedCategory === cat;

          return (
            <div key={cat} className={`glass rounded-xl border overflow-hidden ${CATEGORY_COLORS[cat]}`}>
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full p-5 flex items-center justify-between text-left transition-colors hover:bg-secondary/10"
              >
                <div className="flex items-center gap-4">
                  <h3 className="font-serif font-semibold text-base">{cat}</h3>
                  <span className="text-xs font-medium opacity-80">{total} members</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 opacity-80" />
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border/30 p-4 animate-fade-in">
                  <div className="flex justify-end mb-4">
                    <Button size="sm" variant="outline" onClick={() => handleExportCategory(cat)} className="gap-1.5 text-xs">
                      <Download className="w-3.5 h-3.5" />
                      Export {cat}
                    </Button>
                  </div>
                  <div className="glass rounded-lg overflow-hidden">
                    <MemberTable members={list} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
