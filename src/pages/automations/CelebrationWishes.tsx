import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAutomations,
  getAutomationLogs,
  initializeDefaults,
  getTodaysBirthdays,
  getTodaysAnniversaries,
  getUpcomingBirthdays,
  getUpcomingAnniversaries,
  getTemplateByType,
  createAutomationLog,
  hasAlreadySentToday,
  updateAutomation,
  updateTemplate,
} from '@/services/automationService';
import { getMembers } from '@/services/firestore';
import {
  generateMessage,
  generatePersonalizedGreeting,
  openWhatsApp,
} from '@/services/whatsappService';
import { Member, Automation, AutomationLog, AutomationTemplate } from '@/types';
import { TemplateEditor } from '@/components/automations/TemplateEditor';
import { TemplatePreview } from '@/components/automations/TemplatePreview';
import { LogsTable } from '@/components/automations/LogsTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Cake,
  Heart,
  Send,
  Play,
  Save,
  Eye,
  Loader2,
  ChevronRight,
  PartyPopper,
  Calendar,
  MessageCircle,
  Users,
  CheckCircle2,
  Copy,
  MapPin,
  UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

type WishTab = 'birthday' | 'anniversary';

const CelebrationWishes: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [recentLogs, setRecentLogs] = useState<AutomationLog[]>([]);
  const [birthdayTemplate, setBirthdayTemplate] = useState<AutomationTemplate | null>(null);
  const [anniversaryTemplate, setAnniversaryTemplate] = useState<AutomationTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<WishTab>('birthday');
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  // Derived state — show ALL members with today's celebration (matching dashboard count)
  const todayBirthdays = getTodaysBirthdays(members);
  const todayAnniversaries = getTodaysAnniversaries(members);
  const upcomingBirthdays = getUpcomingBirthdays(members, 7);
  const upcomingAnniversaries = getUpcomingAnniversaries(members, 7);
  const currentTemplate = activeTab === 'birthday' ? birthdayTemplate : anniversaryTemplate;
  const currentTemplateBody = currentTemplate?.body || '';
  const todayMembers = activeTab === 'birthday' ? todayBirthdays : todayAnniversaries;

  /**
   * Resolve the effective phone number for a member.
   * If the member has no phone, fall back to the family head's phone.
   */
  const getEffectivePhone = (member: Member): string => {
    if (member.phone && member.phone.trim().length >= 10) {
      return member.phone;
    }
    // Fall back to family head's phone
    if (member.familyId && !member.isHeadOfFamily) {
      const head = members.find(m => m.isHeadOfFamily && m.familyId === member.familyId);
      if (head?.phone && head.phone.trim().length >= 10) {
        return head.phone;
      }
    }
    return member.phone; // return original (empty/short) so downstream checks still work
  };

  /**
   * Check WhatsApp eligibility using the effective phone (own or family head's).
   */
  const isEligibleWithFallback = (member: Member): boolean => {
    const effectivePhone = getEffectivePhone(member);
    if (!effectivePhone || effectivePhone.trim().length < 10) return false;
    if (member.whatsappEnabled === false) return false;
    if (member.status === 'expired' || member.status === 'left') return false;
    if (member.status === 'do_not_disturb') return false;
    return true;
  };

  // Only WhatsApp-eligible members (own phone or family head's) can be sent messages
  const sendableMembers = todayMembers.filter(isEligibleWithFallback);
  const upcomingMembers = activeTab === 'birthday' ? upcomingBirthdays : upcomingAnniversaries;

  useEffect(() => {
    const loadData = async () => {
      try {
        await initializeDefaults();
        const [membersData, automationsData, logsData, bTemplate, aTemplate] = await Promise.all([
          getMembers(),
          getAutomations(),
          getAutomationLogs({ limitCount: 15 }),
          getTemplateByType('birthday'),
          getTemplateByType('anniversary'),
        ]);
        setMembers(membersData);
        setAutomations(automationsData);
        setRecentLogs(logsData);
        setBirthdayTemplate(bTemplate);
        setAnniversaryTemplate(aTemplate);
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleTemplateChange = (value: string) => {
    if (activeTab === 'birthday' && birthdayTemplate) {
      setBirthdayTemplate({ ...birthdayTemplate, body: value });
    } else if (activeTab === 'anniversary' && anniversaryTemplate) {
      setAnniversaryTemplate({ ...anniversaryTemplate, body: value });
    }
  };

  const handleSaveTemplate = async () => {
    const template = activeTab === 'birthday' ? birthdayTemplate : anniversaryTemplate;
    if (!template) return;
    setSaving(true);
    try {
      await updateTemplate(template.id, { body: template.body });
      toast.success(`${activeTab === 'birthday' ? 'Birthday' : 'Anniversary'} template saved`);
    } catch (error) {
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = () => {
    if (!testPhone || testPhone.trim().length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }
    // Create a sample member for personalized greeting test
    const sampleMember: Member = {
      id: 'test',
      memberId: 'TEST001',
      name: 'சரவணன்',
      dob: '1990-01-01',
      gender: 'male',
      phone: testPhone,
      address: { place: '', city: '', district: '', state: '', country: '', pincode: '' },
      familyId: '',
      isHeadOfFamily: false,
      relationship: 'Head',
      maritalStatus: 'married',
      baptismStatus: 'baptized',
      churchRole: 'attendee',
      status: 'regular',
      createdAt: '',
      updatedAt: '',
    };
    const message = generateMessage(currentTemplateBody, sampleMember, activeTab);
    openWhatsApp(testPhone, message);
    toast.success('WhatsApp opened with test message');
    setShowTestDialog(false);
    setTestPhone('');
  };

  const handleCopyMessage = async (member: Member) => {
    const message = generateMessage(currentTemplateBody, member, activeTab);
    try {
      await navigator.clipboard.writeText(message);
      toast.success(`Message copied for ${member.name}`);
    } catch (err) {
      toast.error('Failed to copy message');
    }
  };

  const handleSendToMember = (member: Member) => {
    const phone = getEffectivePhone(member);
    const message = generateMessage(currentTemplateBody, member, activeTab);
    const success = openWhatsApp(phone, message);
    if (success) {
      createAutomationLog({
        automationType: activeTab,
        memberId: member.id,
        memberName: member.name,
        phone,
        status: 'sent',
        sentAt: new Date().toISOString(),
      });
      toast.success(`WhatsApp opened for ${member.name}`);
    }
  };

  const handleRunAll = async () => {
    if (sendableMembers.length === 0) {
      toast.info(`No eligible members for ${activeTab} wishes today`);
      return;
    }
    setRunning(true);
    let sentCount = 0;
    let failedCount = 0;

    try {
      for (const member of sendableMembers) {
        const alreadySent = await hasAlreadySentToday(member.id, activeTab);
        if (alreadySent) {
          toast.info(`Already sent to ${member.name}, skipping`);
          continue;
        }
        const phone = getEffectivePhone(member);
        const message = generateMessage(currentTemplateBody, member, activeTab);
        const success = openWhatsApp(phone, message);
        await createAutomationLog({
          automationType: activeTab,
          memberId: member.id,
          memberName: member.name,
          phone,
          status: success ? 'sent' : 'failed',
          sentAt: new Date().toISOString(),
        });
        if (success) sentCount++;
        else failedCount++;
        if (sendableMembers.indexOf(member) < sendableMembers.length - 1) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      // Update automation record
      const automation = automations.find((a) => a.type === activeTab);
      if (automation) {
        const newStatus = failedCount === 0 ? 'success' : sentCount > 0 ? 'partial' : 'failed';
        await updateAutomation(automation.id, {
          lastRunAt: new Date().toISOString(),
          lastRunStatus: newStatus,
          lastRunSentCount: sentCount,
          lastRunFailedCount: failedCount,
        });
      }
      toast.success(`${sentCount} sent, ${failedCount} failed`);

      // Refresh logs
      const updatedLogs = await getAutomationLogs({ limitCount: 15 });
      setRecentLogs(updatedLogs);
    } catch (error) {
      toast.error('Failed to send wishes');
    } finally {
      setRunning(false);
    }
  };

  const handleToggleAutomation = async (type: WishTab, enabled: boolean) => {
    const automation = automations.find((a) => a.type === type);
    if (!automation) return;
    try {
      await updateAutomation(automation.id, { enabled });
      setAutomations((prev) =>
        prev.map((a) => (a.id === automation.id ? { ...a, enabled } : a))
      );
      toast.success(`${type === 'birthday' ? 'Birthday' : 'Anniversary'} wishes ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const birthdayAutomation = automations.find((a) => a.type === 'birthday');
  const anniversaryAutomation = automations.find((a) => a.type === 'anniversary');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/automations')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/20">
              <PartyPopper className="w-6 h-6 text-pink-400" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-gold-gradient">Celebration Wishes</h1>
              <p className="text-sm text-muted-foreground">Send birthday & anniversary wishes via WhatsApp</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTestDialog(true)}
            className="gap-2 text-xs"
          >
            <Send className="w-3.5 h-3.5" />
            Test Send
          </Button>
          <Button
            onClick={handleRunAll}
            disabled={running || sendableMembers.length === 0}
            className="gap-2"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Send All ({sendableMembers.length})
          </Button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 bg-secondary/30 rounded-xl p-1 w-fit animate-fade-in [animation-delay:100ms]">
        <button
          onClick={() => setActiveTab('birthday')}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
            activeTab === 'birthday'
              ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-400 shadow-sm border border-pink-500/20'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Cake className="w-4 h-4" />
          Birthday
          {todayBirthdays.length > 0 && (
            <Badge className="h-5 px-1.5 text-[10px] bg-pink-500/20 text-pink-400 border-0">
              {todayBirthdays.length}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab('anniversary')}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
            activeTab === 'anniversary'
              ? 'bg-gradient-to-r from-rose-500/20 to-amber-500/20 text-rose-400 shadow-sm border border-rose-500/20'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Heart className="w-4 h-4" />
          Anniversary
          {todayAnniversaries.length > 0 && (
            <Badge className="h-5 px-1.5 text-[10px] bg-rose-500/20 text-rose-400 border-0">
              {todayAnniversaries.length}
            </Badge>
          )}
        </button>
      </div>

      {/* Enable Toggle */}
      <div className="glass rounded-xl p-4 flex items-center justify-between animate-fade-in [animation-delay:150ms]">
        <div className="flex items-center gap-3">
          {activeTab === 'birthday' ? (
            <Cake className="w-5 h-5 text-pink-400" />
          ) : (
            <Heart className="w-5 h-5 text-rose-400" />
          )}
          <div>
            <Label className="text-sm font-medium">
              {activeTab === 'birthday' ? 'Birthday Wishes' : 'Anniversary Wishes'}
            </Label>
            <p className="text-xs text-muted-foreground">
              {activeTab === 'birthday'
                ? (birthdayAutomation?.enabled ? 'Enabled — ready to send' : 'Disabled')
                : (anniversaryAutomation?.enabled ? 'Enabled — ready to send' : 'Disabled')}
            </p>
          </div>
        </div>
        <Switch
          checked={activeTab === 'birthday' ? birthdayAutomation?.enabled : anniversaryAutomation?.enabled}
          onCheckedChange={(checked) => handleToggleAutomation(activeTab, checked)}
        />
      </div>

      {/* Today's Celebrations */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:200ms]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="font-serif text-lg font-semibold">
              Today's {activeTab === 'birthday' ? 'Birthdays' : 'Anniversaries'}
            </h3>
            <Badge variant="outline" className="text-xs">
              {todayMembers.length} member{todayMembers.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>

        {todayMembers.length === 0 ? (
          <div className="text-center py-8">
            <div className={cn(
              'w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center',
              activeTab === 'birthday' ? 'bg-pink-500/10' : 'bg-rose-500/10'
            )}>
              {activeTab === 'birthday' ? (
                <Cake className="w-8 h-8 text-pink-400/50" />
              ) : (
                <Heart className="w-8 h-8 text-rose-400/50" />
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              No {activeTab === 'birthday' ? 'birthdays' : 'anniversaries'} today
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {todayMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-xl bg-secondary/20 hover:bg-secondary/40 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold',
                    activeTab === 'birthday' ? 'bg-pink-500/10 text-pink-400' : 'bg-rose-500/10 text-rose-400'
                  )}>
                    {member.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{member.name}</p>
                    {(() => {
                      const effectivePhone = getEffectivePhone(member);
                      const isFromHead = effectivePhone && effectivePhone !== member.phone;
                      return effectivePhone && effectivePhone.trim().length >= 10 ? (
                        <p className="text-xs text-muted-foreground">
                          {effectivePhone}
                          {isFromHead && <span className="ml-1 text-[10px] text-amber-400/80">(head)</span>}
                        </p>
                      ) : null;
                    })()}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      {member.address?.place && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate max-w-[140px]">{[member.address.place, member.address.city].filter(Boolean).join(', ')}</span>
                        </span>
                      )}
                      {(() => {
                        const head = member.isHeadOfFamily
                          ? member
                          : members.find(m => m.isHeadOfFamily && m.familyId === member.familyId);
                        return head ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Users className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[120px]">{head.name}</span>
                          </span>
                        ) : null;
                      })()}
                      {member.fellowship && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <UsersRound className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate max-w-[140px]">{member.fellowship}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isEligibleWithFallback(member) ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleCopyMessage(member)}
                        title="Copy message"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'gap-1.5 text-xs h-8',
                          activeTab === 'birthday' ? 'hover:text-pink-400' : 'hover:text-rose-400'
                        )}
                        onClick={() => handleSendToMember(member)}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Send via wa.me
                      </Button>
                    </>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 italic px-2">No phone</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming */}
      {upcomingMembers.length > 0 && (
        <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:250ms]">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-amber-400" />
            <h3 className="font-serif text-lg font-semibold">
              Upcoming (Next 7 Days)
            </h3>
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">
              {upcomingMembers.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {upcomingMembers.slice(0, 9).map((member) => {
              const dateField = activeTab === 'birthday' ? member.dob : member.anniversaryDate;
              const date = dateField ? new Date(dateField) : null;
              const thisYear = date
                ? new Date(new Date().getFullYear(), date.getMonth(), date.getDate())
                : null;
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/20"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-xs font-bold text-amber-400">
                    {member.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{member.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {thisYear ? format(thisYear, 'MMM dd') : '—'}
                      {thisYear ? ` (${formatDistanceToNow(thisYear, { addSuffix: false })})` : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0 mt-0.5">
                      {member.address?.place && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
                          <MapPin className="w-2.5 h-2.5" />
                          {[member.address.place, member.address.city].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {member.fellowship && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
                          <UsersRound className="w-2.5 h-2.5" />
                          {member.fellowship}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Template Editor & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:300ms]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-semibold">
              {activeTab === 'birthday' ? 'Birthday' : 'Anniversary'} Template
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs gap-1 lg:hidden"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </Button>
              <Button
                size="sm"
                onClick={handleSaveTemplate}
                disabled={saving}
                className="text-xs gap-1"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </Button>
            </div>
          </div>
          {currentTemplate && (
            <TemplateEditor
              value={currentTemplate.body}
              onChange={handleTemplateChange}
              variables={currentTemplate.variables}
            />
          )}
        </div>

        <div className={cn(
          'glass rounded-xl p-6 animate-fade-in [animation-delay:400ms]',
          'hidden lg:block',
          showPreview && '!block'
        )}>
          <h3 className="font-serif text-lg font-semibold mb-4">Preview</h3>
          <TemplatePreview 
            message={currentTemplateBody} 
            greetingPrefix={activeTab === 'birthday' 
              ? 'Dear Brother சரவணன்,' 
              : 'Dear Brother சரவணன்,'
            }
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:500ms]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-semibold">Recent Activity</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/automations/logs')}
            className="text-xs gap-1"
          >
            View All
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
        <LogsTable logs={recentLogs} compact maxRows={10} />
      </div>

      {/* Test Send Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">
              Test Send — {activeTab === 'birthday' ? 'Birthday' : 'Anniversary'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                placeholder="Enter phone number (e.g., 9876543210)"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
            <div className="p-3 rounded-lg bg-secondary/20 text-xs text-muted-foreground">
              <p>The message will use "சரவணன்" as a sample name in the template.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowTestDialog(false)}>Cancel</Button>
              <Button onClick={handleTestSend} className="gap-2">
                <Send className="w-4 h-4" />
                Send Test
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CelebrationWishes;
