import React, { useState, useEffect } from 'react';
import { getEvents, createEvent, updateEvent, deleteEvent as deleteFirestoreEvent, getMembers, getAttendance } from '@/services/firestore';
import { ChurchEvent, FellowshipType, FELLOWSHIP_OPTIONS, Member, Attendance as AttendanceType, EventStatus } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Calendar, Clock, Edit2, Trash2, Loader2, Users, CheckCircle, PlayCircle, XCircle, BarChart3 } from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { toast } from 'sonner';

const FELLOWSHIP_COLORS: Record<FellowshipType, string> = {
  'Children': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Youth Boys Fellowship': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Youth Girls Fellowship': 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  "Men's Fellowship": 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  "Women's Fellowship": 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

const getCategoryForMember = (member: Member): FellowshipType => {
  if (member.fellowship) return member.fellowship;
  const age = member.dob ? differenceInYears(new Date(), new Date(member.dob)) : 0;
  if (age < 13) return 'Children';
  const isMarried = member.maritalStatus === 'married';
  if (!isMarried && age < 40) {
    return member.gender === 'male' ? 'Youth Boys Fellowship' : 'Youth Girls Fellowship';
  }
  return member.gender === 'male' ? "Men's Fellowship" : "Women's Fellowship";
};

const Events: React.FC = () => {
  const { hasPermission } = useAuth();
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ChurchEvent | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<AttendanceType[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    time: '',
    description: '',
    fellowships: [] as FellowshipType[]
  });

  const canCreate = hasPermission('events.create');
  const canEdit = hasPermission('events.edit');

  // Fetch events, members, and attendance from Firestore
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [eventsData, membersData, attendanceData] = await Promise.all([
          getEvents(),
          getMembers(),
          getAttendance()
        ]);
        setEvents(eventsData);
        setMembers(membersData);
        setAttendance(attendanceData);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getEventStats = (event: ChurchEvent) => {
    const eventAttendance = attendance.filter(a => a.eventId === event.id);
    const presentIds = new Set(eventAttendance.map(a => a.memberId));
    
    let eligibleCount = members.length;
    if (event.fellowships && event.fellowships.length > 0) {
      eligibleCount = members.filter(m => {
        if (m.status === 'expired') return false;
        const f = getCategoryForMember(m);
        return event.fellowships!.includes(f);
      }).length;
    } else {
      // If no fellowships specified, count all non-expired
      eligibleCount = members.filter(m => m.status !== 'expired').length;
    }

    const presentCount = presentIds.size;
    const absentCount = Math.max(0, eligibleCount - presentCount);

    return { presentCount, absentCount, eligibleCount };
  };

  const toggleFellowship = (fellowship: FellowshipType) => {
    setFormData(prev => ({
      ...prev,
      fellowships: prev.fellowships.includes(fellowship)
        ? prev.fellowships.filter(f => f !== fellowship)
        : [...prev.fellowships, fellowship]
    }));
  };

  const selectAllFellowships = () => {
    setFormData(prev => ({
      ...prev,
      fellowships: prev.fellowships.length === FELLOWSHIP_OPTIONS.length 
        ? [] 
        : [...FELLOWSHIP_OPTIONS]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.fellowships.length === 0) {
      toast.error('Please select at least one fellowship');
      return;
    }

    try {
      if (editingEvent) {
        await updateEvent(editingEvent.id, {
          name: formData.name,
          date: formData.date,
          time: formData.time || undefined,
          description: formData.description,
          fellowships: formData.fellowships
        });
        setEvents(events.map(ev => 
          ev.id === editingEvent.id 
            ? { ...ev, name: formData.name, date: formData.date, time: formData.time || undefined, description: formData.description, fellowships: formData.fellowships }
            : ev
        ));
        toast.success('Event updated successfully');
      } else {
        const newEventData = {
          name: formData.name,
          date: formData.date,
          time: formData.time || undefined,
          description: formData.description,
          fellowships: formData.fellowships,
          status: 'upcoming' as EventStatus,
          createdAt: new Date().toISOString().split('T')[0]
        };
        const id = await createEvent(newEventData);
        setEvents([{ id, ...newEventData }, ...events]);
        toast.success('Event created successfully');
      }

      setFormData({ name: '', date: '', time: '', description: '', fellowships: [] });
      setEditingEvent(null);
      setShowAddModal(false);
    } catch (error) {
      console.error('Error saving event:', error);
      toast.error('Failed to save event');
    }
  };

  const handleEdit = (event: ChurchEvent) => {
    setEditingEvent(event);
    setFormData({
      name: event.name,
      date: event.date,
      time: event.time || '',
      description: event.description || '',
      fellowships: event.fellowships || []
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this event?')) {
      try {
        await deleteFirestoreEvent(id);
        setEvents(events.filter(ev => ev.id !== id));
        toast.success('Event deleted successfully');
      } catch (error) {
        console.error('Error deleting event:', error);
        toast.error('Failed to delete event');
      }
    }
  };

  const handleStatusChange = async (eventId: string, newStatus: EventStatus) => {
    const label = newStatus === 'active' ? 'Active' : newStatus === 'ended' ? 'Ended' : 'Upcoming';
    try {
      await updateEvent(eventId, { status: newStatus });
      setEvents(events.map(ev =>
        ev.id === eventId ? { ...ev, status: newStatus } : ev
      ));
      toast.success(`Event marked as "${label}"`);
      if (newStatus === 'ended') {
        toast.info('Analytics email will be sent automatically if enabled');
      }
    } catch (error) {
      console.error('Error updating event status:', error);
      toast.error('Failed to update status');
    }
  };

  const statusConfig: Record<EventStatus, { label: string; color: string; icon: React.ElementType }> = {
    upcoming: { label: 'Upcoming', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Calendar },
    active: { label: 'Active', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: PlayCircle },
    ended: { label: 'Ended', color: 'bg-gray-500/10 text-gray-400 border-gray-500/20', icon: CheckCircle },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="font-serif text-3xl font-bold text-gold-gradient">Events</h1>
          <p className="text-muted-foreground">Manage church events and services</p>
        </div>
        {canCreate && (
          <Dialog open={showAddModal} onOpenChange={(open) => {
            setShowAddModal(open);
            if (!open) {
              setEditingEvent(null);
              setFormData({ name: '', date: '', time: '', description: '', fellowships: [] });
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary hover:bg-primary/90">
                <Plus className="w-4 h-4" />
                Create Event
              </Button>
            </DialogTrigger>
            <DialogContent className="glass max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-serif text-xl">
                  {editingEvent ? 'Edit Event' : 'Create New Event'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Event Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-secondary/50"
                    placeholder="e.g., Sunday Service"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="bg-secondary/50"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="bg-secondary/50"
                    placeholder="Event details..."
                    rows={3}
                  />
                </div>

                {/* Fellowships Selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      Fellowships *
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectAllFellowships}
                      className="text-xs text-primary hover:text-primary/80 h-7 px-2"
                    >
                      {formData.fellowships.length === FELLOWSHIP_OPTIONS.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-1">
                    Select which fellowships participate in this event. Only members from selected fellowships will appear during attendance.
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {FELLOWSHIP_OPTIONS.map((fellowship) => {
                      const isSelected = formData.fellowships.includes(fellowship);
                      return (
                        <button
                          key={fellowship}
                          type="button"
                          onClick={() => toggleFellowship(fellowship)}
                          className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                            isSelected
                              ? `${FELLOWSHIP_COLORS[fellowship]} border-current shadow-sm`
                              : 'border-border/50 bg-secondary/20 hover:bg-secondary/40 text-muted-foreground'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all shrink-0 ${
                            isSelected 
                              ? 'bg-current border-current' 
                              : 'border-muted-foreground/40'
                          }`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className="text-sm font-medium">{fellowship}</span>
                        </button>
                      );
                    })}
                  </div>
                  {formData.fellowships.length === 0 && (
                    <p className="text-xs text-destructive">Please select at least one fellowship</p>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-primary hover:bg-primary/90">
                    {editingEvent ? 'Update' : 'Create'} Event
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Events List */}
      <div className="space-y-4">
        {events.map((event, index) => {
          const stats = getEventStats(event);
          return (
            <div
              key={event.id}
              className="glass rounded-xl p-4 md:p-6 card-hover animate-fade-in flex flex-col md:flex-row gap-4 justify-between items-start md:items-center"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-4 flex-1">
                <div className="p-3 rounded-xl bg-primary/10 text-primary hidden sm:block shrink-0">
                  <Calendar className="w-6 h-6" />
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-lg text-foreground">{event.name}</h3>
                    {/* Status Badge */}
                    {(() => {
                      const status = event.status || 'upcoming';
                      const cfg = statusConfig[status];
                      const StatusIcon = cfg.icon;
                      return (
                        <Badge variant="outline" className={`text-[10px] py-0.5 px-2 ${cfg.color}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {cfg.label}
                        </Badge>
                      );
                    })()}
                    <div className="flex items-center gap-2 ml-0 md:ml-2 text-xs font-medium">
                      <span className="bg-emerald-500/10 text-emerald-500 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        Present: {stats.presentCount}
                      </span>
                      <span className="bg-rose-500/10 text-rose-500 px-2.5 py-1 rounded-full border border-rose-500/20">
                        Absent: {stats.absentCount}
                      </span>
                    </div>
                  </div>
                  <p className="text-primary font-medium text-sm flex items-center gap-1.5">
                    {format(new Date(event.date), 'EEEE, MMMM dd, yyyy')}
                    {event.time && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {event.time}
                      </span>
                    )}
                  </p>
                  {event.description && (
                    <p className="text-muted-foreground text-sm">{event.description}</p>
                  )}
                  {/* Fellowship Badges */}
                  {event.fellowships && event.fellowships.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {event.fellowships.map((fellowship) => (
                        <Badge
                          key={fellowship}
                          variant="outline"
                          className={`text-[10px] py-0 px-1.5 ${FELLOWSHIP_COLORS[fellowship]}`}
                        >
                          {fellowship}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {canEdit && (
                <div className="flex flex-wrap gap-2 shrink-0 w-full md:w-auto justify-end border-t md:border-t-0 border-border/30 pt-3 md:pt-0 mt-2 md:mt-0">
                  {/* Status Actions */}
                  {(event.status === 'upcoming' || !event.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                      onClick={() => handleStatusChange(event.id, 'active')}
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      Start
                    </Button>
                  )}
                  {event.status === 'active' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                      onClick={() => handleStatusChange(event.id, 'ended')}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      End Event
                    </Button>
                  )}
                  {event.status === 'ended' && event.analyticsSent && (
                    <Badge variant="outline" className="h-8 text-xs gap-1 bg-blue-500/10 text-blue-400 border-blue-500/20">
                      <BarChart3 className="w-3.5 h-3.5" />
                      Analytics Sent
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-blue-400"
                    onClick={() => handleEdit(event)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(event.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {events.length === 0 && (
        <div className="glass rounded-xl p-12 text-center">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No events created yet.</p>
        </div>
      )}
    </div>
  );
};

export default Events;
