export type PGN = {
  canId: number;
  prio: number;
  src: number;
  dst: number;
  pgn: number;
  time: string; // "00:00:00.010";
  input: string[];
  fields: Record<string, string | number>;
  description: string;
  timestamp: string; // "2022-11-19T17:46:54.400Z";
};
