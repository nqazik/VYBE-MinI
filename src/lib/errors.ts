const KNOWN: [RegExp, string][] = [
  [/room_full/, 'This room already has 3 people.'],
  [/room_not_found/, "We couldn't find that room. Double-check the code."],
  [/not_host/, 'Only the host can do that.'],
  [/host_still_here/, 'The host is still here.'],
  [/not_a_member/, "You're not in this room."],
  [/queue_full/, 'The queue is full (30 videos).'],
  [/queue_empty/, 'The queue is empty.'],
  [/invalid_video/, "That doesn't look like a YouTube video."],
  [/invalid_name/, 'Pick a display name between 1 and 24 characters.'],
  [/invalid_avatar/, 'Pick an avatar.'],
  [/too_many_rooms/, "You've hosted a lot of rooms. Leave one before creating another."],
  [/not_authenticated/, "You're not signed in yet. Reload the page and try again."],
  [/anonymous sign-ins are disabled/i, 'Anonymous sign-ins are switched off in your Supabase project (see the README, step 3).'],
  [/Could not find the function|PGRST202|schema cache/i, "The database isn't set up yet. Run supabase/schema.sql (see the README)."],
  [/relation .* does not exist|PGRST205/i, "The database isn't set up yet. Run supabase/schema.sql (see the README)."],
  [/row-level security|permission denied/i, "You don't have access to that."],
  [/failed to fetch|networkerror|load failed|network request failed|fetch failed/i, 'Connection problem. Check your internet and try again.'],
  [/non-2xx/i, "Voice chat isn't set up on the server yet (see the README, “Voice chat”)."],
]

/** Turn any thrown value (Postgres error, network error...) into a short sentence for the UI. */
export function friendlyError(error: unknown): string {
  let message = ''
  if (typeof error === 'string') message = error
  else if (error && typeof error === 'object') {
    const e = error as { message?: unknown; error_description?: unknown; details?: unknown }
    message = [e.message, e.error_description, e.details].filter((x) => typeof x === 'string').join(' ')
  }
  for (const [pattern, text] of KNOWN) if (pattern.test(message)) return text
  return 'Something went wrong. Please try again.'
}
