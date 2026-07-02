import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getAutomationByType,
  getTemplateByType,
  updateAutomation,
  updateTemplate,
  getAutomationLogs,
  getTodaysBirthdays,
  getTodaysAnniversaries,
  createAutomationLog,
  hasAlreadySentToday,
  initializeDefaults,
} from '@/services/automationService';
import { getMembers } from '@/services/firestore';
import {
  generateMessage,
  openWhatsApp,
  isEligibleForWhatsApp,
} from '@/services/whatsappService';
import { Automation, AutomationTemplate, AutomationLog, AutomationType, Member } from '@/types';
import { TemplateEditor } from '@/components/automations/TemplateEditor';
import { TemplatePreview } from '@/components/automations/TemplatePreview';
import { LogsTable } from '@/components/automations/LogsTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  Play,
  Send,
  Eye,
  Cake,
  Heart,
  Loader2,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const typeConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  birthday: { icon: Cake, label: 'Birthday Wishes', color: 'text-pink-400' },
  anniversary: { icon: Heart, label: 'Anniversary Wishes', color: 'text-rose-400' },
};

const AutomationConfig: React.FC = () => {
  const navigate = useNavigate();
  const { type } = useParams<{ type: string }>();
  const automationType = (type || 'birthday') as AutomationType;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [template, setTemplate] = useState<AutomationTemplate | null>(null);
  const [templateBody, setTemplateBody] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [enabled, setEnabled] = useState(false);
  const [recentLogs, setRecentLogs] = useState<AutomationLog[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [eligibleMembers, setEligibleMembers] = useState<Member[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  const config = typeConfig[automationType] || typeConfig.birthday;
  const Icon = config.icon;

  useEffect(() => {
    const loadData = async () => {
      try {
        await initializeDefaults();
        
        const [automationData, templateData, logsData, membersData] = await Promise.all([
          getAutomationByType(automationType),
          getTemplateByType(automationType),
          getAutomationLogs({ automationType, limitCount: 20 }),
          getMembers(),
        ]);

        if (automationData) {
          setAutomation(automationData);
          setEnabled(automationData.enabled);
          if (automationData.scheduleTime) {
            setScheduleTime(automationData.scheduleTime);
          }
        }

        if (templateData) {
          setTemplate(templateData);
          setTemplateBody(templateData.body);
        }

        setRecentLogs(logsData);
        setMembers(membersData);

        // Calculate eligible members for today
        const todayMembers =
          automationType === 'birthday'
            ? getTodaysBirthdays(membersData)
            : getTodaysAnniversaries(membersData);
        setEligibleMembers(todayMembers.filter(isEligibleForWhatsApp));
      } catch (error) {
        console.error('Error loading automation config:', error);
        toast.error('Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [automationType]);

  const handleSave = async () => {
    if (!automation || !template) return;
    setSaving(true);
    try {
      await Promise.all([
        updateAutomation(automation.id, {
          enabled,
          scheduleTime,
        }),
        updateTemplate(template.id, {
          body: templateBody,
        }),
      ]);
      toast.success('Configuration saved successfully');
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = () => {
    if (!testPhone || testPhone.trim().length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }
    const message = generateMessage(templateBody, 'சரவணன்');
    const success = openWhatsApp(testPhone, message);
    if (success) {
      toast.success('WhatsApp opened with test message');
    } else {
      toast.error('Failed to open WhatsApp');
    }
    setShowTestDialog(false);
    setTestPhone('');
  };

  const handleRunNow = async () => {
    if (!automation || !template) return;
    setRunning(true);

    try {
      if (eligibleMembers.length === 0) {
        toast.info(`No eligible members for ${config.label} today`);
        await updateAutomation(automation.id, {
          lastRunAt: new Date().toISOString(),
          lastRunStatus: 'no_recipients',
          lastRunSentCount: 0,
          lastRunFailedCount: 0,
        });
        setRunning(false);
        return;
      }

      let sentCount = 0;
      let failedCount = 0;

      for (const member of eligibleMembers) {
        const alreadySent = await hasAlreadySentToday(member.id, automationType);
        if (alreadySent) {
          toast.info(`Already sent to ${member.name} today, skipping`);
          continue;
        }

        const message = generateMessage(templateBody, member.name);
        const success = openWhatsApp(member.phone, message);

        await createAutomationLog({
          automationId: automation.id,
          automationType,
          memberId: member.id,
          memberName: member.name,
          phone: member.phone,
          status: success ? 'sent' : 'failed',
          errorMessage: success ? undefined : 'Failed to open WhatsApp',
          sentAt: new Date().toISOString(),
        });

        if (success) sentCount++;
        else failedCount++;

        if (eligibleMembers.indexOf(member) < eligibleMembers.length - 1) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      const newStatus = failedCount === 0 ? 'success' : sentCount > 0 ? 'partial' : 'failed';
      await updateAutomation(automation.id, {
        lastRunAt: new Date().toISOString(),
        lastRunStatus: newStatus,
        lastRunSentCount: sentCount,
        lastRunFailedCount: failedCount,
      });

      toast.success(`${config.label}: ${sentCount} sent, ${failedCount} failed`);

      // Refresh logs
      const updatedLogs = await getAutomationLogs({ automationType, limitCount: 20 });
      setRecentLogs(updatedLogs);
    } catch (error) {
      console.error('Error running automation:', error);
      toast.error('Failed to run automation');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!automation || !template) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Automation not found. Please return to the dashboard.</p>
        <Button variant="outline" onClick={() => navigate('/automations')} className="mt-4">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const sentLogs = recentLogs.filter((l) => l.status === 'sent' || l.status === 'delivered').length;
  const failedLogs = recentLogs.filter((l) => l.status === 'failed').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/automations')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className={cn('p-2.5 rounded-xl', automationType === 'birthday' ? 'bg-pink-500/10' : 'bg-rose-500/10')}>
              <Icon className={cn('w-6 h-6', config.color)} />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-gold-gradient">{config.label}</h1>
              <p className="text-sm text-muted-foreground">{automation.description}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRunNow}
            disabled={running}
            className="gap-2"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Now
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Config & Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Enable/Disable & Schedule */}
        <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:100ms]">
          <h3 className="font-serif text-lg font-semibold mb-4">Configuration</h3>
          <div className="space-y-6">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Enable Automation</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {enabled ? 'Automation is active' : 'Automation is disabled'}
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {/* Schedule Time */}
            <div className="space-y-2">
                  <Label>Reminder Time</Label>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="bg-secondary/50"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Reminder for when to click “Run Now”. Messages are sent manually via wa.me links.
                  </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:200ms]">
          <h3 className="font-serif text-lg font-semibold mb-4">Delivery Stats</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm">Messages Sent</span>
              </div>
              <span className="text-lg font-bold text-emerald-400">{sentLogs}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm">Messages Failed</span>
              </div>
              <span className="text-lg font-bold text-red-400">{failedLogs}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-sm">Last Run</span>
              </div>
              <span className="text-sm font-medium text-blue-400">
                {automation.lastRunAt
                  ? new Date(automation.lastRunAt).toLocaleDateString()
                  : 'Never'}
              </span>
            </div>
          </div>
        </div>

        {/* Eligible Members Today */}
        <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:300ms]">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="font-serif text-lg font-semibold">Eligible Today</h3>
          </div>
          {eligibleMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No eligible members for today
            </p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {eligibleMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.phone}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      const message = generateMessage(templateBody, member.name);
                      openWhatsApp(member.phone, message);
                    }}
                  >
                    <Send className="w-3 h-3" />
                    Send
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Template Editor & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:400ms]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-semibold">Template Editor</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTestDialog(true)}
                className="text-xs gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                Test Send
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs gap-1 lg:hidden"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </Button>
            </div>
          </div>
          <TemplateEditor
            value={templateBody}
            onChange={setTemplateBody}
            variables={template.variables}
          />
        </div>

        {/* Preview */}
        <div className={cn(
          'glass rounded-xl p-6 animate-fade-in [animation-delay:500ms]',
          'hidden lg:block',
          showPreview && '!block'
        )}>
          <h3 className="font-serif text-lg font-semibold mb-4">Preview</h3>
          <TemplatePreview message={templateBody} />
        </div>
      </div>

      {/* Recent Logs */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:600ms]">
        <h3 className="font-serif text-lg font-semibold mb-4">Recent Delivery Logs</h3>
        <LogsTable logs={recentLogs} showType={false} maxRows={20} />
      </div>

      {/* Test Send Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Test Send — {config.label}</DialogTitle>
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

export default AutomationConfig;
