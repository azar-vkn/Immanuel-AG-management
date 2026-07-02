export interface SubTeamData {
  name: string;
  areas: string[];
  leaders: string[]; // Member IDs of sub-team leaders
}

export interface TeamGroupData {
  id: string;
  name: string; // e.g. "Team A"
  leaders: string[]; // Member IDs of team group leaders
  subTeams: SubTeamData[];
  createdAt: string;
  updatedAt: string;
}
