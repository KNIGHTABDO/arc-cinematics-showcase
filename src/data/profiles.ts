export interface Profile {
  id: string;
  name: string;
  initials: string;
}

export const PROFILES: Profile[] = [
  { id: "p1", name: "Alex", initials: "AL" },
  { id: "p2", name: "Jordan", initials: "JO" },
  { id: "p3", name: "Sasha", initials: "SA" },
  { id: "p4", name: "Kids", initials: "KD" },
];
