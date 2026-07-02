import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileSpreadsheet, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

const APP_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'dob', label: 'Date of Birth', required: true },
  { key: 'gender', label: 'Gender', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'place', label: 'Place (Address)', required: false },
  { key: 'city', label: 'City', required: false },
  { key: 'district', label: 'District', required: false },
  { key: 'state', label: 'State', required: false },
  { key: 'country', label: 'Country', required: false },
  { key: 'pincode', label: 'Pincode', required: false },
  { key: 'memberId', label: 'Member ID', required: false },
  { key: 'familyId', label: 'Family ID', required: false },
  { key: 'isHeadOfFamily', label: 'Is Head of Family / Member Type', required: false },
  { key: 'relationship', label: 'Relationship', required: false },
  { key: 'maritalStatus', label: 'Marital Status', required: false },
  { key: 'anniversaryDate', label: 'Anniversary / Married Date', required: false },
  { key: 'baptismStatus', label: 'Baptism Status', required: false },
  { key: 'baptismDate', label: 'Baptism / Communion Date', required: false },
  { key: 'churchRole', label: 'Church Role', required: false },
  { key: 'team', label: 'Team / Zonal', required: false },
  { key: 'status', label: 'Status / Category', required: false },
  { key: 'remarks', label: 'Remarks', required: false },
  { key: 'additionalPhones', label: 'Additional Phones', required: false },
  { key: 'tamilName', label: 'Tamil Name', required: false },
  { key: 'tamilAddress', label: 'Tamil Address', required: false },
  { key: 'fellowship', label: 'Fellowship', required: false },
  { key: 'title', label: 'Title (Mr/Mrs/Miss)', required: false },
] as const;

const SKIP_VALUE = '__skip__';

interface ImportMapperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileColumns: string[];
  previewRows: Record<string, string>[];
  onConfirm: (mapping: Record<string, string>) => void;
}

function autoMatch(fileColumns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const aliases: Record<string, string[]> = {
    name: ['name', 'fullname', 'membername', 'full name', 'membername'],
    dob: ['dob', 'dateofbirth', 'birthday', 'birthdate', 'date of birth'],
    gender: ['gender', 'sex'],
    phone: ['phone', 'mobile', 'phonenumber', 'mobilenumber', 'contact', 'phone number', 'mobile number'],
    place: ['place', 'address', 'street', 'locality', 'area'],
    city: ['city', 'town'],
    district: ['district'],
    state: ['state', 'province'],
    country: ['country', 'nation'],
    pincode: ['pincode', 'zipcode', 'postalcode', 'zip', 'pin'],
    memberId: ['memberid', 'id', 'member id', 'memberid'],
    familyId: ['familyid', 'family id', 'familyid', 'family_id'],
    isHeadOfFamily: ['isheadoffamily', 'head', 'familyhead', 'is head', 'membertype', 'member_type', 'member type'],
    relationship: ['relationship', 'relation'],
    maritalStatus: ['maritalstatus', 'marital status'],
    anniversaryDate: ['anniversarydate', 'anniversary', 'anniversary date', 'married'],
    baptismStatus: ['baptismstatus', 'baptism status'],
    baptismDate: ['baptismdate', 'baptism date', 'baptism', 'communion'],
    churchRole: ['churchrole', 'church role', 'role'],
    team: ['team', 'group', 'cell', 'zonal', 'zone'],
    status: ['status', 'memberstatus', 'member status', 'category'],
    remarks: ['remarks', 'notes', 'comment', 'comments'],
    additionalPhones: ['additionalphones', 'otherphones', 'phone2', 'additional phones'],
    tamilName: ['tamilname', 'tamil name', 'tamil_name', 'name_tamil'],
    tamilAddress: ['tamiladdress', 'tamil address', 'tamil_address', 'address_tamil'],
    fellowship: ['fellowship'],
    title: ['title'],
  };

  for (const col of fileColumns) {
    const norm = normalize(col);
    for (const [appKey, aliasList] of Object.entries(aliases)) {
      if (aliasList.some(a => normalize(a) === norm) && !mapping[appKey]) {
        mapping[appKey] = col;
        break;
      }
    }
  }
  return mapping;
}

export const ImportMapperDialog: React.FC<ImportMapperDialogProps> = ({
  open,
  onOpenChange,
  fileColumns,
  previewRows,
  onConfirm,
}) => {
  const [mapping, setMapping] = useState<Record<string, string>>(() => autoMatch(fileColumns));

  // Re-run auto-match when fileColumns change
  React.useEffect(() => {
    setMapping(autoMatch(fileColumns));
  }, [fileColumns]);

  const requiredFields = APP_FIELDS.filter(f => f.required);
  const missingRequired = requiredFields.filter(f => !mapping[f.key] || mapping[f.key] === SKIP_VALUE);

  const usedColumns = useMemo(() => {
    return new Set(Object.values(mapping).filter(v => v && v !== SKIP_VALUE));
  }, [mapping]);

  const unmappedColumns = fileColumns.filter(c => !usedColumns.has(c));

  const handleMappingChange = (appField: string, fileColumn: string) => {
    setMapping(prev => ({
      ...prev,
      [appField]: fileColumn === SKIP_VALUE ? SKIP_VALUE : fileColumn,
    }));
  };

  const handleConfirm = () => {
    const cleanMapping: Record<string, string> = {};
    for (const [appKey, fileCol] of Object.entries(mapping)) {
      if (fileCol && fileCol !== SKIP_VALUE) {
        cleanMapping[appKey] = fileCol;
      }
    }
    onConfirm(cleanMapping);
  };

  // Get a preview value for a mapped field
  const getPreview = (appField: string): string => {
    const fileCol = mapping[appField];
    if (!fileCol || fileCol === SKIP_VALUE || previewRows.length === 0) return '—';
    const val = previewRows[0][fileCol];
    return val ? String(val).substring(0, 30) : '—';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col glass">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Map Your Columns
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Match your file's columns to the app fields. We auto-matched what we could — review and adjust as needed.
          </p>
        </DialogHeader>

        {/* Summary */}
        <div className="flex flex-wrap gap-2 py-2">
          <Badge variant="outline" className="text-xs">
            {fileColumns.length} columns in file
          </Badge>
          <Badge variant="outline" className="text-xs">
            {previewRows.length} rows found
          </Badge>
          {unmappedColumns.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {unmappedColumns.length} unmapped columns
            </Badge>
          )}
          {missingRequired.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              {missingRequired.length} required fields missing
            </Badge>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0 max-h-[50vh] pr-2">
          <div className="space-y-2">
            {APP_FIELDS.map(field => (
              <div
                key={field.key}
                className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                {/* App field label */}
                <div className="w-40 shrink-0">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    {field.label}
                    {field.required && <span className="text-destructive">*</span>}
                  </p>
                </div>

                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

                {/* Column selector */}
                <div className="flex-1 min-w-0">
                  <Select
                    value={mapping[field.key] || SKIP_VALUE}
                    onValueChange={(val) => handleMappingChange(field.key, val)}
                  >
                    <SelectTrigger className="bg-background/50 h-9 text-sm">
                      <SelectValue placeholder="Skip this field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP_VALUE}>
                        <span className="text-muted-foreground">— Skip —</span>
                      </SelectItem>
                      {fileColumns.map(col => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status icon */}
                <div className="w-6 shrink-0 flex justify-center">
                  {mapping[field.key] && mapping[field.key] !== SKIP_VALUE ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : field.required ? (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  ) : null}
                </div>

                {/* Preview */}
                <div className="w-28 shrink-0 text-right">
                  <p className="text-xs text-muted-foreground truncate" title={getPreview(field.key)}>
                    {getPreview(field.key)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t border-border/50">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={missingRequired.length > 0}
            className="gap-2"
          >
            {missingRequired.length > 0
              ? `Map ${missingRequired.length} required field(s)`
              : `Import ${previewRows.length} members`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
