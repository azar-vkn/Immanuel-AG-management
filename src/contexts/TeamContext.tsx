import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TeamGroupData, SubTeamData } from '@/types/team';
import { getTeamGroups, createTeamGroup } from '@/services/firestore';
import { teamStructure as defaultTeamStructure } from '@/data/mockData';

interface TeamContextType {
  teamGroups: TeamGroupData[];
  loading: boolean;
  refresh: () => Promise<void>;
  // Derived helpers
  allSubTeamNames: string[];
  getTeamGroupForSubTeam: (subTeam: string) => string | undefined;
  getAreasForSubTeam: (subTeam: string) => string[];
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export const TeamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [teamGroups, setTeamGroups] = useState<TeamGroupData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTeams = useCallback(async () => {
    try {
      let groups = await getTeamGroups();

      // Seed default data if Firestore is empty
      if (groups.length === 0) {
        const seedPromises = defaultTeamStructure.map(g =>
          createTeamGroup({
            name: g.name,
            leaders: [],
            subTeams: g.subTeams.map(st => ({ name: st.name, areas: st.areas, leaders: [] })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        );
        await Promise.all(seedPromises);
        groups = await getTeamGroups();
      }

      // De-duplicate by name (guards against duplicate Firestore documents from re-seeding)
      const seen = new Set<string>();
      groups = groups.filter(g => {
        if (seen.has(g.name)) return false;
        seen.add(g.name);
        return true;
      });

      // Sort by name
      groups.sort((a, b) => a.name.localeCompare(b.name));
      setTeamGroups(groups);
    } catch (error) {
      console.error('Error loading team groups:', error);
      // Fallback to static data
      setTeamGroups(
        defaultTeamStructure.map((g, i) => ({
          id: `default-${i}`,
          name: g.name,
          leaders: [],
          subTeams: g.subTeams.map(st => ({ name: st.name, areas: st.areas, leaders: [] })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const allSubTeamNames = teamGroups.flatMap(g => g.subTeams.map(st => st.name));

  const getTeamGroupForSubTeam = useCallback(
    (subTeam: string) => teamGroups.find(g => g.subTeams.some(st => st.name === subTeam))?.name,
    [teamGroups]
  );

  const getAreasForSubTeam = useCallback(
    (subTeam: string): string[] => {
      for (const g of teamGroups) {
        const st = g.subTeams.find(s => s.name === subTeam);
        if (st) return st.areas;
      }
      return [];
    },
    [teamGroups]
  );

  return (
    <TeamContext.Provider
      value={{
        teamGroups,
        loading,
        refresh: loadTeams,
        allSubTeamNames,
        getTeamGroupForSubTeam,
        getAreasForSubTeam,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
};

export const useTeams = () => {
  const context = useContext(TeamContext);
  if (!context) {
    throw new Error('useTeams must be used within TeamProvider');
  }
  return context;
};
