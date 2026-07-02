// This file now contains only static configuration data
// All dynamic data (members, families, events, attendance) should be fetched from Firestore

import { DashboardStats, Member } from '@/types';

// Church Area Team Structure
// Each team (A, B, C, D) has sub-teams, and each sub-team covers specific areas
export interface SubTeam {
  name: string; // e.g. "A1", "B3"
  areas: string[];
}

export interface TeamGroup {
  name: string; // e.g. "Team A"
  subTeams: SubTeam[];
}

export const teamStructure: TeamGroup[] = [
  {
    name: 'Team A',
    subTeams: [
      { name: 'A1', areas: ['Abishekapatti'] },
      { name: 'A2', areas: ['Amman Sanathi', 'Akasalai'] },
      { name: 'A3', areas: ['Periya theru', 'kulavanigarpuram', 'china karikathopu'] },
      { name: 'A4', areas: ['Golden Nagar', 'Junction'] },
      { name: 'A5', areas: ['kanniyakudi street', 'VOC', 'Kamatchi amman kovil theru', 'Junction', 'Kambukadai Theru', 'Kalathi Muduku theru'] },
      { name: 'A6', areas: ['Karuvelankundu', 'Kodeeswaran Nagar', 'Bhagavath Singh'] },
    ],
  },
  {
    name: 'Team B',
    subTeams: [
      { name: 'B1', areas: ['Magilvannanathapuram', 'Kunnathur', 'koolakadai bazar', 'thenpathu'] },
      { name: 'B2', areas: ['Palaymkottai', 'Madha then mela theru', 'Madha mela theru'] },
      { name: 'B3', areas: ['Mettutheru'] },
      { name: 'B4', areas: ['Mettutheru'] },
      { name: 'B5', areas: ['Mettutheru', 'NGO'] },
      { name: 'B6', areas: ['Mugamathu', 'melakarai', 'bharathiyar'] },
    ],
  },
  {
    name: 'Team C',
    subTeams: [
      { name: 'C1', areas: ['Palaya pettai', 'Gandhi Nagar', 'Sirpuram'] },
      { name: 'C2', areas: ['Baba Street', 'Ramayan patti', 'Melacheval'] },
      { name: 'C3', areas: ['Pettai', 'Patapathu', 'Narasinganallur'] },
      { name: 'C4', areas: ['Samathanapuram', 'Saliyar theru', 'Theppakulam'] },
      { name: 'C5', areas: ['Otrai theru', 'Meenatchi puram'] },
      { name: 'C6', areas: ['Putarathi amman kovil theru', 'mount road', 'TMC', 'Takarammal Puram', 'senkunthar'] },
    ],
  },
  {
    name: 'Team D',
    subTeams: [
      { name: 'D1', areas: ['Suthamalli', 'Melapalayam'] },
      { name: 'D2', areas: ['Vagaiadi', 'Thotipala theru', 'Thachanallur', 'Police Quarters', 'Kamuthi', 'Town'] },
      { name: 'D3', areas: ['Vilagam', 'Mukkudal', 'Poolankudirupu'] },
      { name: 'D4', areas: ['Thenpathu', 'Sudalai', 'thenpathu road'] },
      { name: 'D5', areas: ['Thadiveeran', 'lalugapuram', 'Veeravanallur'] },
      { name: 'D6', areas: ['Venuvakumaravel', 'Ramanathapuram', 'Mada street'] },
    ],
  },
];

// Legacy flat teams list (team group names) for backward compatibility
export const teams = teamStructure.map(t => t.name);

// Get all sub-team names as a flat list (e.g. ['A1','A2',...,'D6'])
export const allSubTeams: string[] = teamStructure.flatMap(t => t.subTeams.map(st => st.name));

// Get the parent team group name for a given sub-team (e.g. 'A1' → 'Team A')
export const getTeamGroupForSubTeam = (subTeam: string): string | undefined => {
  return teamStructure.find(t => t.subTeams.some(st => st.name === subTeam))?.name;
};

// Get the areas for a given sub-team (e.g. 'A3' → ['Periya theru', ...])
export const getAreasForSubTeam = (subTeam: string): string[] => {
  for (const group of teamStructure) {
    const st = group.subTeams.find(s => s.name === subTeam);
    if (st) return st.areas;
  }
  return [];
};

// Get sub-teams for a given team group name (e.g. 'Team A' → [{name:'A1',...},...])
export const getSubTeamsForTeam = (teamName: string): SubTeam[] => {
  return teamStructure.find(t => t.name === teamName)?.subTeams ?? [];
};

// Empty dashboard stats placeholder - Should be calculated from Firestore data
export const getDashboardStats = (): DashboardStats => {
  return {
    totalMembers: 0,
    presentLastEvent: 0,
    birthdaysThisWeek: [],
    anniversariesThisWeek: []
  };
};

// Note: Mock data has been removed. 
// Use the Firestore service (src/services/firestore.ts) to fetch real data.
// 
// Example usage in components:
// 
// import { getMembers, getFamilies, getEvents } from '@/services/firestore';
// 
// const [members, setMembers] = useState<Member[]>([]);
// 
// useEffect(() => {
//   const fetchData = async () => {
//     const data = await getMembers();
//     setMembers(data);
//   };
//   fetchData();
// }, []);
