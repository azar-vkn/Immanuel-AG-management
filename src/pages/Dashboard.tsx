import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

import { StatCard } from '@/components/dashboard/StatCard';
import { BirthdayCard } from '@/components/dashboard/BirthdayCard';

import { getMembers, getEvents, getAttendance } from '@/services/firestore';
import { getTodaysBirthdays, getTodaysAnniversaries } from '@/services/automationService';
import { Member, ChurchEvent, Attendance, FellowshipType } from '@/types';
import { Users, UserCheck, Calendar, TrendingUp, Loader2 } from 'lucide-react';
import { format, addDays, subDays, differenceInYears } from 'date-fns';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch data from Firestore
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [membersData, eventsData, attendanceData] = await Promise.all([
          getMembers(),
          getEvents(),
          getAttendance()
        ]);
        setMembers(membersData);
        setEvents(eventsData);
        setAttendance(attendanceData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Calculate stats
  const lastEvent = events[0];
  
  // Compute eligible members for the last event (same logic as Reports page)
  const eligibleMembers = (() => {
    if (!lastEvent) return members.filter(m => m.status !== 'expired');
    const eventFellowships = lastEvent.fellowships;
    
    // If no fellowships are set (legacy events), show all non-expired members
    if (!eventFellowships || eventFellowships.length === 0) {
      return members.filter(m => m.status !== 'expired');
    }

    return members.filter(m => {
      if (m.status === 'expired') return false;
      
      const age = m.dob ? differenceInYears(new Date(), new Date(m.dob)) : 0;
      let memberFellowship = m.fellowship;
      if (!memberFellowship) {
        if (age < 13) memberFellowship = 'Children';
        else {
          const isMarried = m.maritalStatus === 'married';
          if (!isMarried && age < 40) {
            memberFellowship = m.gender === 'male' ? 'Youth Boys Fellowship' : 'Youth Girls Fellowship';
          } else {
            memberFellowship = m.gender === 'male' ? "Men's Fellowship" : "Women's Fellowship";
          }
        }
      }
      return eventFellowships.includes(memberFellowship as FellowshipType);
    });
  })();

  // Count unique present members from eligible members (deduplicated, matching Reports page)
  const eligibleIds = new Set(eligibleMembers.map(m => m.id));
  const lastEventAttendance = lastEvent 
    ? new Set(
        attendance
          .filter(a => a.eventId === lastEvent.id && eligibleIds.has(a.memberId))
          .map(a => a.memberId)
      ).size
    : 0;

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDate = today.getDate();

  const birthdaysToday = getTodaysBirthdays(members);

  const anniversariesToday = getTodaysAnniversaries(members);

  const attendanceRate = eligibleMembers.length > 0 
    ? Math.round((lastEventAttendance / eligibleMembers.length) * 100) 
    : 0;



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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="font-serif text-3xl font-bold text-gold-gradient mb-2">
            Welcome, {user?.name}
          </h1>
          <p className="text-muted-foreground">
            Here's what's happening at Immanuel AG Church
          </p>
        </div>

      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Members"
          value={members.length}
          icon={Users}
          description="Registered members"
          className="[animation-delay:100ms]"
        />
        <StatCard
          title="Present Last Event"
          value={lastEventAttendance}
          icon={UserCheck}
          description={lastEvent ? format(new Date(lastEvent.date), 'MMM dd, yyyy') : 'No events'}
          className="[animation-delay:200ms]"
        />
        <StatCard
          title="Birthdays Today"
          value={birthdaysToday.length}
          icon={Calendar}
          description="Celebrations today"
          className="[animation-delay:300ms]"
        />
        <StatCard
          title="Attendance Rate"
          value={`${attendanceRate}%`}
          icon={TrendingUp}
          description="Last event"
          trend={{ value: 5, isPositive: true }}
          className="[animation-delay:400ms]"
        />
      </div>

      {/* Birthday & Anniversary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BirthdayCard 
          members={birthdaysToday} 
          type="birthday" 
          allMembers={members}
        />
        <BirthdayCard 
          members={anniversariesToday} 
          type="anniversary" 
          allMembers={members}
        />
      </div>

      {/* Quick Actions */}
      <div className="glass rounded-xl p-6 animate-fade-in [animation-delay:500ms]">
        <h3 className="font-serif text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction 
            label="Mark Attendance" 
            href="/attendance" 
            color="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
          />
          <QuickAction 
            label="Add Member" 
            href="/members" 
            color="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
          />
          <QuickAction 
            label="Create Event" 
            href="/events" 
            color="bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
          />
          <QuickAction 
            label="View Reports" 
            href="/reports" 
            color="bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
          />
        </div>
      </div>
    </div>
  );
};

const QuickAction: React.FC<{ label: string; href: string; color: string }> = ({ label, href, color }) => (
  <Link
    to={href}
    className={`p-4 rounded-lg text-center font-medium transition-all duration-200 ${color}`}
  >
    {label}
  </Link>
);

export default Dashboard;
