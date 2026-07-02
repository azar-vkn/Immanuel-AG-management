import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMembers } from '@/services/firestore';
import {
  getAutomationDashboardStats,
  initializeDefaults,
  getTodaysBirthdays,
  getTodaysAnniversaries,
  getUpcomingBirthdays,
  getUpcomingAnniversaries,
} from '@/services/automationService';
import { getAnalyticsEmailLogs } from '@/services/analyticsEmailService';
import { Member, AutomationDashboardStats } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  PartyPopper,
  BarChart3,
  Cake,
  Heart,
  ChevronRight,
  Loader2,
  Sparkles,
  Mail,
  Send,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const AutomationsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AutomationDashboardStats | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        await initializeDefaults();
        const membersData = await getMembers();
        const dashboardStats = await getAutomationDashboardStats(membersData);
        setStats(dashboardStats);
      } catch (error) {
        console.error('Error loading automation dashboard:', error);
        toast.error('Failed to load automation data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-primary/10">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-serif text-3xl font-bold text-gold-gradient">Automations</h1>
            <p className="text-muted-foreground">Automate your church communications & reports</p>
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Celebration Wishes Card */}
        <div
          onClick={() => navigate('/automations/wishes')}
          className={cn(
            'group relative rounded-2xl overflow-hidden cursor-pointer',
            'border border-border/30 backdrop-blur-xl',
            'transition-all duration-500 ease-out',
            'hover:-translate-y-1 hover:shadow-2xl hover:shadow-pink-500/10',
            'animate-fade-in [animation-delay:100ms]'
          )}
        >
          {/* Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-amber-500/10 opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-pink-500/15 to-transparent rounded-bl-full" />
          
          <div className="relative p-8">
            {/* Icon & Title */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/20 group-hover:scale-110 transition-transform duration-300">
                  <PartyPopper className="w-7 h-7 text-pink-400" />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-bold text-foreground">Celebration Wishes</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Birthday & Anniversary via WhatsApp</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-pink-400 group-hover:translate-x-1 transition-all" />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3.5 rounded-xl bg-background/40 border border-border/20">
                <div className="flex items-center gap-2 mb-1.5">
                  <Cake className="w-4 h-4 text-pink-400" />
                  <span className="text-xs text-muted-foreground font-medium">Today's Birthdays</span>
                </div>
                <p className="text-2xl font-bold text-gold-gradient">{stats?.todayBirthdays ?? 0}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-background/40 border border-border/20">
                <div className="flex items-center gap-2 mb-1.5">
                  <Heart className="w-4 h-4 text-rose-400" />
                  <span className="text-xs text-muted-foreground font-medium">Today's Anniversaries</span>
                </div>
                <p className="text-2xl font-bold text-gold-gradient">{stats?.todayAnniversaries ?? 0}</p>
              </div>
            </div>

            {/* Footer Info */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="text-xs bg-pink-500/10 text-pink-400 border-pink-500/20">
                  <Cake className="w-3 h-3 mr-1" />
                  {stats?.upcomingBirthdays ?? 0} upcoming
                </Badge>
                <Badge variant="outline" className="text-xs bg-rose-500/10 text-rose-400 border-rose-500/20">
                  <Heart className="w-3 h-3 mr-1" />
                  {stats?.upcomingAnniversaries ?? 0} upcoming
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Send className="w-3.5 h-3.5" />
                <span>{stats?.messagesSentToday ?? 0} sent today</span>
              </div>
            </div>
          </div>
        </div>

        {/* Analytics Email Card */}
        <div
          onClick={() => navigate('/automations/analytics')}
          className={cn(
            'group relative rounded-2xl overflow-hidden cursor-pointer',
            'border border-border/30 backdrop-blur-xl',
            'transition-all duration-500 ease-out',
            'hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/10',
            'animate-fade-in [animation-delay:200ms]'
          )}
        >
          {/* Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-emerald-500/10 opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-blue-500/15 to-transparent rounded-bl-full" />
          
          <div className="relative p-8">
            {/* Icon & Title */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 group-hover:scale-110 transition-transform duration-300">
                  <BarChart3 className="w-7 h-7 text-blue-400" />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-bold text-foreground">Event Analytics</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Automated analytics email reports</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
            </div>

            {/* Description */}
            <div className="p-4 rounded-xl bg-background/40 border border-border/20 mb-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                When an event is marked as <strong className="text-foreground">"Ended"</strong>, automatically 
                generate and send a detailed analytics report to your configured email recipients.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-3 gap-2 mb-6">
              {['Auto-Send', 'Analytics', 'Email Reports'].map((feature, i) => (
                <div key={feature} className="flex items-center gap-1.5 p-2 rounded-lg bg-background/30 border border-border/10">
                  <Sparkles className="w-3 h-3 text-blue-400 flex-shrink-0" />
                  <span className="text-[11px] text-muted-foreground font-medium">{feature}</span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">
                <Mail className="w-3 h-3 mr-1" />
                {stats?.pendingAnalyticsEmails ?? 0} pending
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1 text-blue-400 hover:text-blue-300"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/automations/analytics');
                }}
              >
                Configure
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutomationsDashboard;
