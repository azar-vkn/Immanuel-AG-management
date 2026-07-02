import React from 'react';
import { Member } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { User, Phone, MapPin, Calendar, Church, Users } from 'lucide-react';
import { format } from 'date-fns';
import { transliterateToTamil } from '@/lib/tamilTransliterate';

interface MemberViewDialogProps {
  member: Member | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MemberViewDialog: React.FC<MemberViewDialogProps> = ({
  member,
  open,
  onOpenChange,
}) => {
  const formatDate = (dateValue?: string | { seconds: number; nanoseconds: number } | null) => {
    if (!dateValue) return 'N/A';
    try {
      // Handle Firestore Timestamp objects
      if (typeof dateValue === 'object' && 'seconds' in dateValue) {
        return format(new Date(dateValue.seconds * 1000), 'dd MMM yyyy');
      }
      return format(new Date(dateValue), 'dd MMM yyyy');
    } catch {
      return typeof dateValue === 'string' ? dateValue : 'N/A';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Member Details
          </DialogTitle>
        </DialogHeader>
        
        {!member ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">No member selected</p>
          </div>
        ) : (

        <div className="space-y-6">
          {/* Header Info */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{member.name}</h2>
              <p className="text-base text-muted-foreground">{member.tamilName || transliterateToTamil(member.name)}</p>
              <p className="text-primary font-mono">{member.memberId}</p>
            </div>
            <div className="flex gap-2">
              <Badge
                variant="outline"
                className={
                  member.baptismStatus === 'baptized'
                    ? 'badge-success'
                    : 'badge-warning'
                }
              >
                {member.baptismStatus === 'baptized' ? 'Baptized' : 'Not Baptized'}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {member.churchRole}
              </Badge>
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Personal Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Date of Birth</span>
                <p className="font-medium">{formatDate(member.dob)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Gender</span>
                <p className="font-medium capitalize">{member.gender}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Marital Status</span>
                <p className="font-medium capitalize">{member.maritalStatus || 'N/A'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Relationship</span>
                <p className="font-medium capitalize">{member.relationship || 'N/A'}</p>
              </div>
              {member.maritalStatus === 'married' && member.anniversaryDate && (
                <div>
                  <span className="text-muted-foreground">Anniversary</span>
                  <p className="font-medium">{formatDate(member.anniversaryDate)}</p>
                </div>
              )}
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* Contact Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              Contact Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Phone</span>
                <p className="font-medium">{member.phone}</p>
              </div>
              <div>
                <span className="text-muted-foreground">WhatsApp Automations</span>
                <p className="font-medium">
                  {member.whatsappEnabled === false ? (
                    <span className="text-muted-foreground">Disabled</span>
                  ) : (
                    <span className="text-emerald-500">Enabled</span>
                  )}
                </p>
              </div>
              {member.additionalPhones && member.additionalPhones.length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Additional Phones</span>
                  <p className="font-medium">{member.additionalPhones.join(', ')}</p>
                </div>
              )}
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* Address */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Address
            </h3>
            <div className="text-sm space-y-1">
              <p className="font-medium">
                {member.address.place && `${member.address.place}, `}
                {member.address.city}
              </p>
              <p className="text-muted-foreground italic">
                {(member.tamilAddress?.place || (member.address.place && transliterateToTamil(member.address.place))) && 
                  `${member.tamilAddress?.place || transliterateToTamil(member.address.place)}, `}
                {member.tamilAddress?.city || transliterateToTamil(member.address.city)}
              </p>
              <p className="text-muted-foreground">
                {member.address.district && `${member.address.district}, `}
                {member.address.state}
                {member.address.pincode && ` - ${member.address.pincode}`}
              </p>
              <p className="text-muted-foreground italic">
                {(member.tamilAddress?.district || (member.address.district && transliterateToTamil(member.address.district))) && 
                  `${member.tamilAddress?.district || transliterateToTamil(member.address.district)}, `}
                {member.tamilAddress?.state || transliterateToTamil(member.address.state)}
              </p>
              <p className="text-muted-foreground">{member.address.country}</p>
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* Church Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Church className="w-4 h-4 text-primary" />
              Church Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Role</span>
                <p className="font-medium capitalize">{member.churchRole}</p>
              </div>
              {member.team && (
                <div>
                  <span className="text-muted-foreground">Team</span>
                  <p className="font-medium">{member.team}</p>
                </div>
              )}
              {member.baptismStatus === 'baptized' && member.baptismDate && (
                <div>
                  <span className="text-muted-foreground">Baptism Date</span>
                  <p className="font-medium">{formatDate(member.baptismDate)}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Member Type</span>
                <p className="font-medium capitalize">{member.isHeadOfFamily ? 'Head' : 'Member'}</p>
              </div>
            </div>
          </div>

          {/* Remarks */}
          {member.remarks && (
            <>
              <Separator className="bg-border/50" />
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Remarks</h3>
                <p className="text-sm text-muted-foreground bg-secondary/30 p-3 rounded-lg">
                  {member.remarks}
                </p>
              </div>
            </>
          )}

          {/* Metadata */}
          <Separator className="bg-border/50" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Created: {formatDate(member.createdAt)}</span>
            <span>Updated: {formatDate(member.updatedAt)}</span>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
