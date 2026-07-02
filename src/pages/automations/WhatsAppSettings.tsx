import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWhatsAppSettings, saveWhatsAppSettings } from '@/services/automationService';
import { openWhatsApp } from '@/services/whatsappService';
import { WhatsAppSettings as WhatsAppSettingsType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Send,
  Info,
  Loader2,
  ExternalLink,
  MessageCircle,
  CheckCircle2,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';

const WhatsAppSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Partial<WhatsAppSettingsType>>({
    mode: 'wa_me',
    connectionStatus: 'not_configured',
  });
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await getWhatsAppSettings();
        if (data) {
          setSettings(data);
        }
      } catch (error) {
        console.error('Error loading WhatsApp settings:', error);
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleTestMessage = async () => {
    if (!testPhone || testPhone.trim().length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }

    const success = openWhatsApp(testPhone, '✅ Test message from Immanuel AG Church Management System.\n\nIf you received this, WhatsApp messaging is working correctly! 🙏');
    if (success) {
      toast.success('WhatsApp opened! Please send the message manually.');

      // Update last successful call
      try {
        await saveWhatsAppSettings({
          ...settings,
          connectionStatus: 'connected',
          lastSuccessfulCall: new Date().toISOString(),
        });
        setSettings(prev => ({
          ...prev,
          connectionStatus: 'connected',
          lastSuccessfulCall: new Date().toISOString(),
        }));
      } catch (e) {
        // Non-critical — just log
        console.error('Failed to update settings after test:', e);
      }
    } else {
      toast.error('Failed to open WhatsApp');
    }
    setShowTestDialog(false);
    setTestPhone('');
  };

  const safeFormatDate = (dateStr: string | undefined, fmt: string): string => {
    if (!dateStr) return 'Never';
    try {
      const d = new Date(dateStr);
      return isValid(d) ? format(d, fmt) : 'Never';
    } catch {
      return 'Never';
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
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 animate-fade-in">
        <Button variant="ghost" size="icon" onClick={() => navigate('/automations')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="font-serif text-3xl font-bold text-gold-gradient">WhatsApp Settings</h1>
          <p className="text-muted-foreground">wa.me deep-link messaging configuration</p>
        </div>
      </div>

      {/* Mode Display */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:100ms]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10">
              <MessageCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-semibold mb-1">wa.me Deep Links</h2>
              <p className="text-sm text-muted-foreground">
                Messages are sent by opening WhatsApp with pre-filled text. You press Send manually for each recipient.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-400">Active</span>
          </div>
        </div>

        {/* Status Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="p-4 rounded-lg bg-secondary/30">
            <p className="text-xs text-muted-foreground mb-1">Mode</p>
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">wa.me (Manual)</span>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <p className="text-xs text-muted-foreground mb-1">Last Test Sent</p>
            <span className="text-sm font-medium">
              {safeFormatDate(settings.lastSuccessfulCall, 'MMM dd, yyyy HH:mm')}
            </span>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:200ms]">
        <h3 className="font-serif text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => setShowTestDialog(true)}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            Send Test Message
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.open('https://web.whatsapp.com', '_blank');
            }}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open WhatsApp Web
          </Button>
        </div>
      </div>

      {/* How It Works */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:300ms]">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-blue-400" />
          <h3 className="font-serif text-lg font-semibold">How It Works</h3>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">1</span>
            <p>Enable Birthday or Anniversary automation from the dashboard.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">2</span>
            <p>Customize the Tamil message template with the built-in editor.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">3</span>
            <p>Click "Run Now" on the dashboard to find today's celebrants and open WhatsApp for each.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">4</span>
            <p>Press Send in WhatsApp for each message. The system logs each attempt automatically.</p>
          </div>
        </div>
      </div>

      {/* Test Message Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Send Test Message</DialogTitle>
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
              <p className="text-xs text-muted-foreground">
                Indian numbers: enter 10 digits without +91 prefix
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowTestDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleTestMessage} className="gap-2">
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

export default WhatsAppSettings;
