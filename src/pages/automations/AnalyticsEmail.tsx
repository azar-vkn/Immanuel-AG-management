import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAnalyticsEmailSettings,
  saveAnalyticsEmailSettings,
  getAnalyticsEmailLogs,
  initializeAnalyticsEmailSettings,
  sendTestAnalyticsEmail,
  resendAnalyticsEmail,
} from '@/services/analyticsEmailService';
import { AnalyticsEmailSettings as SettingsType, AnalyticsEmailLog } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  ArrowLeft,
  BarChart3,
  Mail,
  Plus,
  Trash2,
  Send,
  Save,
  Loader2,
  Info,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Download,
  RotateCw,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';

const AnalyticsEmail: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Partial<SettingsType>>({
    enabled: false,
    recipients: [],
    senderName: 'Immanuel AG Church',
  });
  const [logs, setLogs] = useState<AnalyticsEmailLog[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [resending, setResending] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        await initializeAnalyticsEmailSettings();
        const [settingsData, logsData] = await Promise.all([
          getAnalyticsEmailSettings(),
          getAnalyticsEmailLogs({ limitCount: 50 }),
        ]);
        if (settingsData) setSettings(settingsData);
        setLogs(logsData);
      } catch (error) {
        console.error('Error loading analytics email settings:', error);
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAnalyticsEmailSettings(settings);
      toast.success('Settings saved');
    } catch (error) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRecipient = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Invalid email address');
      return;
    }
    if (settings.recipients?.includes(email)) {
      toast.error('Email already added');
      return;
    }
    const updatedRecipients = [...(settings.recipients || []), email];
    const updatedSettings = { ...settings, recipients: updatedRecipients };
    setSettings(updatedSettings);
    setNewEmail('');
    try {
      const { id, ...dataToSave } = updatedSettings as SettingsType;
      await saveAnalyticsEmailSettings(dataToSave);
      toast.success('Recipient added');
    } catch (error) {
      console.error('Error saving recipient:', error);
      toast.error('Failed to save recipient');
      // Revert on failure
      setSettings(prev => ({
        ...prev,
        recipients: (prev.recipients || []).filter(e => e !== email),
      }));
    }
  };

  const handleRemoveRecipient = async (email: string) => {
    const updatedRecipients = (settings.recipients || []).filter(e => e !== email);
    const updatedSettings = { ...settings, recipients: updatedRecipients };
    setSettings(updatedSettings);
    try {
      const { id, ...dataToSave } = updatedSettings as SettingsType;
      await saveAnalyticsEmailSettings(dataToSave);
      toast.success('Recipient removed');
    } catch (error) {
      console.error('Error removing recipient:', error);
      toast.error('Failed to remove recipient');
      // Revert on failure
      setSettings(prev => ({
        ...prev,
        recipients: [...(prev.recipients || []), email],
      }));
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())) {
      toast.error('Please enter a valid email');
      return;
    }
    setSendingTest(true);
    try {
      const result = await sendTestAnalyticsEmail(testEmail.trim());
      if (result.success) {
        toast.success('Test email sent successfully!');
        setShowTestDialog(false);
        setTestEmail('');
      } else {
        toast.error(result.error || 'Failed to send test email');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const handleResend = async (logId: string) => {
    setResending(logId);
    try {
      const result = await resendAnalyticsEmail(logId);
      if (result.success) {
        toast.success('Email resent!');
        // Refresh logs
        const updatedLogs = await getAnalyticsEmailLogs({ limitCount: 50 });
        setLogs(updatedLogs);
      } else {
        toast.error(result.error || 'Resend failed');
      }
    } catch (error) {
      toast.error('Failed to resend');
    } finally {
      setResending(null);
    }
  };

  const handleExportLogs = () => {
    const headers = ['Event Name', 'Event Date', 'Recipients', 'Status', 'Attendees', 'Attendance %', 'Sent At', 'Error'];
    const rows = logs.map(log => [
      log.eventName,
      log.eventDate,
      log.recipients.join(', '),
      log.status,
      `${log.totalAttendees}/${log.totalRegistered}`,
      `${log.attendancePercentage}%`,
      log.sentAt || '',
      log.errorMessage || '',
    ]);
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analytics Email Logs');
    XLSX.writeFile(wb, `analytics_email_logs_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Logs exported');
  };

  const refreshLogs = async () => {
    const updatedLogs = await getAnalyticsEmailLogs({ limitCount: 50 });
    setLogs(updatedLogs);
    toast.success('Logs refreshed');
  };

  const safeFormatDate = (dateStr: string | undefined, fmt: string): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return isValid(d) ? format(d, fmt) : '—';
    } catch {
      return '—';
    }
  };

  const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    sent: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Sent' },
    failed: { icon: AlertCircle, color: 'text-red-400', label: 'Failed' },
    pending: { icon: Clock, color: 'text-amber-400', label: 'Pending' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/automations')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20">
              <BarChart3 className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-gold-gradient">Event Analytics Email</h1>
              <p className="text-sm text-muted-foreground">Auto-send analytics when events end</p>
            </div>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </Button>
      </div>

      {/* Enable Toggle */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:100ms]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-blue-400" />
            <div>
              <Label className="text-sm font-medium">Enable Analytics Emails</Label>
              <p className="text-xs text-muted-foreground">
                {settings.enabled
                  ? 'Analytics emails will be sent automatically when events are ended'
                  : 'Analytics emails are disabled'}
              </p>
            </div>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enabled: checked }))}
          />
        </div>
      </div>

      {/* Sender Name */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:150ms]">
        <h3 className="font-serif text-lg font-semibold mb-4">Sender Configuration</h3>
        <div className="space-y-2">
          <Label>Sender Display Name</Label>
          <Input
            value={settings.senderName || ''}
            onChange={(e) => setSettings(prev => ({ ...prev, senderName: e.target.value }))}
            placeholder="e.g., Immanuel AG Church"
            className="bg-secondary/50 max-w-md"
          />
          <p className="text-xs text-muted-foreground">
            This name appears as the "From" name in recipient inboxes
          </p>
        </div>
      </div>

      {/* Recipient Management */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:200ms]">
        <h3 className="font-serif text-lg font-semibold mb-4">Email Recipients</h3>
        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1 max-w-md space-y-2">
            <Label>Add Recipient</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="email@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRecipient()}
                className="bg-secondary/50"
              />
              <Button onClick={handleAddRecipient} size="icon" className="shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {(settings.recipients || []).length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border/50 rounded-xl">
            <Mail className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p>No recipients added yet</p>
            <p className="text-xs mt-1">Add email addresses to receive event analytics reports</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(settings.recipients || []).map((email) => (
              <div
                key={email}
                className="flex items-center justify-between p-3 rounded-xl bg-secondary/20 hover:bg-secondary/30 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-sm font-medium">{email}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => handleRemoveRecipient(email)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:250ms]">
        <h3 className="font-serif text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setShowTestDialog(true)} className="gap-2">
            <Send className="w-4 h-4" />
            Send Test Email
          </Button>
        </div>
      </div>

      {/* Delivery History */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:300ms]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-semibold">Delivery History</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshLogs} className="gap-2 text-xs">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            {logs.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportLogs} className="gap-2 text-xs">
                <Download className="w-3.5 h-3.5" />
                Export
              </Button>
            )}
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <BarChart3 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
            <p>No analytics emails sent yet</p>
            <p className="text-xs mt-1">Emails will appear here when events are marked as "Ended"</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {logs.map((log) => {
              const config = statusConfig[log.status] || statusConfig.pending;
              const StatusIcon = config.icon;
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-secondary/20 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <StatusIcon className={cn('w-5 h-5 flex-shrink-0', config.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{log.eventName}</p>
                        <Badge variant="outline" className={cn('text-[10px]', config.color)}>
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {log.eventDate} • {log.totalAttendees}/{log.totalRegistered} attendees ({log.attendancePercentage}%)
                        {log.sentAt && ` • Sent ${safeFormatDate(log.sentAt, 'MMM dd, HH:mm')}`}
                      </p>
                      {log.errorMessage && (
                        <p className="text-xs text-red-400 mt-0.5">{log.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  {log.status === 'failed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={resending === log.id}
                      onClick={() => handleResend(log.id)}
                      className="text-xs gap-1 ml-2 flex-shrink-0"
                    >
                      {resending === log.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCw className="w-3.5 h-3.5" />
                      )}
                      Resend
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:350ms]">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-blue-400" />
          <h3 className="font-serif text-lg font-semibold">How It Works</h3>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold">1</span>
            <p>Add recipient email addresses above and save settings.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold">2</span>
            <p>Enable the analytics email toggle.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold">3</span>
            <p>When you mark an event as <strong className="text-foreground">"Ended"</strong> on the Events page, the system automatically collects analytics data.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold">4</span>
            <p>A professional HTML email with attendance stats, gender breakdown, and event details is generated and sent to all recipients.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold">5</span>
            <p>Delivery status is logged. Failed emails can be manually resent.</p>
          </div>
        </div>
      </div>

      {/* Test Email Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Send Test Analytics Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Recipient Email</Label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="bg-secondary/50"
              />
              <p className="text-xs text-muted-foreground">
                A sample analytics report will be sent to this email address.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowTestDialog(false)}>Cancel</Button>
              <Button onClick={handleTestEmail} disabled={sendingTest} className="gap-2">
                {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Test
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AnalyticsEmail;
