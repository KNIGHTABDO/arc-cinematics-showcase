const KIDS_MOVIE_GENRES = new Set([16, 10751]); // Animation, Family
const KIDS_TV_GENRES = new Set([16, 10762]); // Animation, Kids
const MOVIE_ALLOWED_CERTS = new Set(["", "G", "PG"]);
const TV_ALLOWED_CERTS = new Set(["", "TV-Y", "TV-Y7", "TV-G", "G", "PG"]);

function normalizeCertification(value: string | null | undefined): string {
  return (value || "").trim().toUpperCase();
}

export function isMovieAllowedForKids(movie: any): boolean {
  if (!movie) return false;
  if (movie.adult === true) return false;

  const genreIds: number[] = Array.isArray(movie.genres)
    ? movie.genres.map((genre: any) => Number(genre?.id)).filter((id: number) => Number.isFinite(id))
    : [];

  const genreAllowed = genreIds.some((id) => KIDS_MOVIE_GENRES.has(id));

  const usCertifications: string[] =
    movie.release_dates?.results
      ?.find((entry: any) => entry?.iso_3166_1 === "US")
      ?.release_dates?.map((entry: any) => normalizeCertification(entry?.certification))
      ?.filter((entry: string) => entry.length > 0) || [];

  const certAllowed =
    usCertifications.length === 0 || usCertifications.every((cert) => MOVIE_ALLOWED_CERTS.has(cert));

  return genreAllowed && certAllowed;
}

export function isTVAllowedForKids(show: any): boolean {
  if (!show) return false;

  const genreIds: number[] = Array.isArray(show.genres)
    ? show.genres.map((genre: any) => Number(genre?.id)).filter((id: number) => Number.isFinite(id))
    : [];

  const genreAllowed = genreIds.some((id) => KIDS_TV_GENRES.has(id));

  const usCertifications: string[] =
    show.content_ratings?.results
      ?.find((entry: any) => entry?.iso_3166_1 === "US")
      ?.rating
      ? [normalizeCertification(show.content_ratings.results.find((entry: any) => entry?.iso_3166_1 === "US")?.rating)]
      : [];

  const certAllowed =
    usCertifications.length === 0 || usCertifications.every((cert) => TV_ALLOWED_CERTS.has(cert));

  return genreAllowed && certAllowed;
}
