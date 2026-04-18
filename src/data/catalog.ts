export interface Title {
  id: string;
  title: string;
  year: number;
  rating: number;
  duration: string;
  cert: string;
  genre: string;
  tagline?: string;
  description: string;
  progress?: number; // 0..1
  episode?: string;
  seed: number;
}

const make = (
  id: string,
  title: string,
  year: number,
  rating: number,
  duration: string,
  cert: string,
  genre: string,
  description: string,
  seed: number,
  extra: Partial<Title> = {},
): Title => ({ id, title, year, rating, duration, cert, genre, description, seed, ...extra });

const baseDesc = "A meticulously crafted journey through shadow and light, weaving memory and motion into a singular vision.";

export const HERO: Title = {
  id: "hero",
  title: "Lattice of Mirrors",
  year: 2024,
  rating: 8.4,
  duration: "2h 18m",
  cert: "TV-MA",
  genre: "Limited Series",
  tagline: "Every reflection hides a door.",
  description:
    "Six strangers wake to discover their lives are entangled across parallel histories. As the lattice fractures, each must choose which version of themselves survives.",
  seed: 0,
};

export const CONTINUE_WATCHING: Title[] = [
  make("cw1", "Velvet Static", 2024, 8.1, "47m", "TV-MA", "Drama", baseDesc, 1, { progress: 0.62, episode: "S2 E4" }),
  make("cw2", "Northbound", 2023, 7.8, "52m", "TV-14", "Thriller", baseDesc, 2, { progress: 0.34, episode: "S1 E7" }),
  make("cw3", "The Quiet Hour", 2024, 8.6, "44m", "TV-MA", "Mystery", baseDesc, 3, { progress: 0.85, episode: "S3 E2" }),
  make("cw4", "Glass Cathedral", 2024, 7.4, "58m", "TV-14", "Sci-Fi", baseDesc, 4, { progress: 0.19, episode: "S1 E1" }),
  make("cw5", "Midnight in Kyoto", 2023, 8.9, "1h 42m", "R", "Romance", baseDesc, 5, { progress: 0.47 }),
  make("cw6", "Paper Tigers", 2024, 7.2, "49m", "TV-MA", "Crime", baseDesc, 6, { progress: 0.71, episode: "S2 E1" }),
];

export const TRENDING: Title[] = [
  make("t1", "Dune: Aftermath", 2024, 9.1, "2h 45m", "PG-13", "Sci-Fi Epic", baseDesc, 7),
  make("t2", "The Last Cartographer", 2024, 8.7, "2h 12m", "R", "Adventure", baseDesc, 8),
  make("t3", "Hollow Crown", 2024, 8.3, "1h 58m", "TV-MA", "Period Drama", baseDesc, 9),
  make("t4", "Signal Fire", 2024, 8.8, "2h 04m", "R", "Thriller", baseDesc, 10),
  make("t5", "Echo Garden", 2024, 7.9, "1h 49m", "PG-13", "Drama", baseDesc, 11),
  make("t6", "Pale Wolves", 2024, 8.5, "2h 21m", "R", "Western", baseDesc, 12),
  make("t7", "After Atlas", 2024, 8.0, "1h 56m", "PG-13", "Sci-Fi", baseDesc, 13),
  make("t8", "Saltwater", 2024, 7.6, "1h 38m", "R", "Romance", baseDesc, 14),
  make("t9", "Iron Lullaby", 2024, 8.2, "2h 09m", "TV-MA", "Crime", baseDesc, 15),
  make("t10", "Vermilion", 2024, 8.4, "1h 52m", "R", "Mystery", baseDesc, 0),
];

export const NEW_ON_ARC: Title[] = [
  make("n1", "Daughter of Storms", 2024, 8.0, "2h 02m", "PG-13", "Fantasy", baseDesc, 1),
  make("n2", "Quiet Architecture", 2024, 7.8, "1h 47m", "PG", "Documentary", baseDesc, 2),
  make("n3", "The Long Wire", 2024, 8.3, "2h 14m", "R", "Crime", baseDesc, 3),
  make("n4", "Marigold Season", 2024, 7.5, "1h 41m", "PG-13", "Drama", baseDesc, 4),
  make("n5", "Prism", 2024, 8.6, "2h 28m", "TV-MA", "Sci-Fi", baseDesc, 5),
  make("n6", "Bone & Bloom", 2024, 7.9, "1h 55m", "R", "Horror", baseDesc, 6),
  make("n7", "Wayfarer", 2024, 8.1, "2h 06m", "PG-13", "Adventure", baseDesc, 7),
  make("n8", "Static Bloom", 2024, 7.7, "1h 44m", "TV-MA", "Drama", baseDesc, 8),
];

export const BECAUSE_DUNE: Title[] = [
  make("b1", "Sand & Ember", 2023, 8.2, "2h 18m", "PG-13", "Sci-Fi Epic", baseDesc, 9),
  make("b2", "The Void Architects", 2023, 7.9, "2h 06m", "PG-13", "Sci-Fi", baseDesc, 10),
  make("b3", "Helios", 2024, 8.5, "2h 22m", "R", "Sci-Fi", baseDesc, 11),
  make("b4", "Worldship", 2023, 8.0, "1h 58m", "PG-13", "Adventure", baseDesc, 12),
  make("b5", "Crimson Dunes", 2024, 7.8, "2h 11m", "PG-13", "Sci-Fi", baseDesc, 13),
  make("b6", "Auriga", 2023, 8.3, "2h 04m", "R", "Sci-Fi", baseDesc, 14),
  make("b7", "Sky Without End", 2024, 7.6, "1h 52m", "PG-13", "Adventure", baseDesc, 15),
  make("b8", "The Mapmakers", 2023, 8.1, "2h 09m", "PG-13", "Sci-Fi", baseDesc, 0),
];

export const ACCLAIMED: Title[] = [
  make("a1", "Loom", 2023, 9.2, "2h 16m", "R", "Drama", baseDesc, 1),
  make("a2", "After the Quiet", 2023, 9.0, "2h 04m", "R", "Drama", baseDesc, 2),
  make("a3", "Mother Tongue", 2024, 8.9, "1h 58m", "TV-MA", "Drama", baseDesc, 3),
  make("a4", "The Cartographer's Daughter", 2023, 8.8, "2h 11m", "R", "Period", baseDesc, 4),
  make("a5", "Glasslands", 2024, 9.1, "2h 22m", "TV-MA", "Drama", baseDesc, 5),
  make("a6", "A Brief Eternity", 2023, 8.7, "1h 47m", "R", "Romance", baseDesc, 6),
  make("a7", "Northwind", 2024, 8.9, "2h 08m", "TV-MA", "Drama", baseDesc, 7),
  make("a8", "The Year of the Wolf", 2023, 9.0, "2h 18m", "R", "Period", baseDesc, 8),
];

export const SHORTS: Title[] = [
  make("s1", "Folded Light", 2024, 8.4, "18m", "NR", "Short Film", baseDesc, 9),
  make("s2", "Postcards from Nowhere", 2024, 8.1, "22m", "NR", "Documentary", baseDesc, 10),
  make("s3", "The Last Bell", 2024, 8.6, "14m", "NR", "Short Film", baseDesc, 11),
  make("s4", "Dust to Velvet", 2024, 7.9, "26m", "NR", "Documentary", baseDesc, 12),
  make("s5", "A Small Sea", 2024, 8.2, "19m", "NR", "Short Film", baseDesc, 13),
  make("s6", "Inherit the Static", 2024, 7.8, "31m", "NR", "Documentary", baseDesc, 14),
  make("s7", "Slow Dawn", 2024, 8.5, "16m", "NR", "Short Film", baseDesc, 15),
  make("s8", "Architecture of Memory", 2024, 8.0, "28m", "NR", "Documentary", baseDesc, 0),
];

export const ALL_TITLES = [
  HERO,
  ...CONTINUE_WATCHING,
  ...TRENDING,
  ...NEW_ON_ARC,
  ...BECAUSE_DUNE,
  ...ACCLAIMED,
  ...SHORTS,
];

export function findTitle(id: string): Title | undefined {
  return ALL_TITLES.find((t) => t.id === id);
}

export const CAST = [
  { name: "Imogen Vale", role: "Mira" },
  { name: "Theo Aris", role: "Daniel" },
  { name: "Naomi Park", role: "Inspector Cole" },
  { name: "Idris Khan", role: "The Archivist" },
  { name: "Léa Moreau", role: "Vienna" },
  { name: "Marcus Reigns", role: "Ash" },
  { name: "Harper Lin", role: "Dr. Voss" },
  { name: "Yuki Sato", role: "Kenji" },
  { name: "Olivia Brand", role: "Madeleine" },
  { name: "Caleb North", role: "The Stranger" },
];

export const EPISODES = Array.from({ length: 8 }, (_, i) => ({
  number: i + 1,
  title: [
    "Pilot Light",
    "The Long Mirror",
    "Velvet Static",
    "Cardinal Doors",
    "Lattice",
    "Half-Life",
    "Inversion",
    "All Things Reflected",
  ][i],
  duration: ["52m", "48m", "55m", "47m", "58m", "51m", "49m", "1h 04m"][i],
  description:
    "Mira follows a thread of static across two cities and finds a door that should not exist.",
  seed: i + 20,
}));
