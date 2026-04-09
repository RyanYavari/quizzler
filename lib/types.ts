export interface Citation {
  content: string;
  source: string;
  page: number | null;
  section: string;
  rank: number;
  relevanceScore: number;
}
