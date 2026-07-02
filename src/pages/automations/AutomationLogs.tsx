import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAutomationLogs } from '@/services/automationService';
import { AutomationLog, AutomationType, DeliveryStatus } from '@/types';
import { LogsTable } from '@/components/automations/LogsTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  ArrowLeft,
  Download,
  Filter,
  X,
  Loader2,
  FileText,
  RefreshCw,
} from 'lucide-react';

const AutomationLogs: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const filters: { automationType?: AutomationType; status?: DeliveryStatus; limitCount?: number } = {
        limitCount: 500,
      };
      if (typeFilter !== 'all') {
        filters.automationType = typeFilter as AutomationType;
      }
      if (statusFilter !== 'all') {
        filters.status = statusFilter as DeliveryStatus;
      }
      const data = await getAutomationLogs(filters);
      setLogs(data);
    } catch (error) {
      console.error('Error loading logs:', error);
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [typeFilter, statusFilter]);

  const handleExport = () => {
    const headers = ['Date & Time', 'Member Name', 'Phone', 'Automation Type', 'Status', 'Error Message', 'WhatsApp Message ID'];
    const rows = logs.map((log) => [
      log.sentAt || log.createdAt,
      log.memberName,
      log.phone,
      log.automationType,
      log.status,
      log.errorMessage || '',
      log.whatsappMessageId || '',
    ]);

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Automation Logs');
    XLSX.writeFile(wb, `automation_logs_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Logs exported successfully');
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    return count;
  }, [typeFilter, statusFilter]);

  const clearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
  };

  // Summary stats
  const summary = useMemo(() => {
    const total = logs.length;
    const sent = logs.filter((l) => l.status === 'sent' || l.status === 'delivered').length;
    const failed = logs.filter((l) => l.status === 'failed').length;
    const queued = logs.filter((l) => l.status === 'queued').length;
    return { total, sent, failed, queued };
  }, [logs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/automations')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-serif text-3xl font-bold text-gold-gradient">Automation Logs</h1>
            <p className="text-muted-foreground">View delivery history for all automations</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadLogs} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Badges */}
      <div className="flex flex-wrap gap-3 animate-fade-in [animation-delay:100ms]">
        <Badge variant="outline" className="text-sm px-3 py-1.5">
          <FileText className="w-3.5 h-3.5 mr-1.5" />
          Total: {summary.total}
        </Badge>
        <Badge variant="outline" className="text-sm px-3 py-1.5 badge-success">
          Sent: {summary.sent}
        </Badge>
        <Badge variant="outline" className="text-sm px-3 py-1.5 bg-red-500/20 text-red-400 border-red-500/30">
          Failed: {summary.failed}
        </Badge>
        {summary.queued > 0 && (
          <Badge variant="outline" className="text-sm px-3 py-1.5 badge-warning">
            Queued: {summary.queued}
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="glass rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-end animate-fade-in [animation-delay:200ms]">
        <div className="space-y-2 flex-1 min-w-[180px]">
          <Label className="text-xs text-muted-foreground">Automation Type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="birthday">Birthday</SelectItem>
              <SelectItem value="anniversary">Anniversary</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 flex-1 min-w-[180px]">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs h-9">
            <X className="w-3 h-3" />
            Clear ({activeFiltersCount})
          </Button>
        )}
      </div>

      {/* Logs Table */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:300ms]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <LogsTable logs={logs} />
        )}
      </div>
    </div>
  );
};

export default AutomationLogs;
