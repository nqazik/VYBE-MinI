/** Row shapes of the tables in supabase/schema.sql */

export interface Room {
  id: string
  code: string
  host_id: string
  max_members: number
  video_id: string | null
  video_title: string | null
  is_playing: boolean
  position_sec: number
  state_updated_at: string
  state_seq: number
  created_at: string
}

export interface Member {
  room_id: string
  user_id: string
  name: string
  avatar: string
  joined_at: string
  last_seen: string
}

export interface ChatMessage {
  id: string
  room_id: string
  user_id: string
  name: string
  avatar: string
  body: string
  created_at: string
}

export interface QueueItem {
  id: string
  seq: number
  room_id: string
  video_id: string
  title: string | null
  added_by: string
  added_name: string
  created_at: string
}

export type NoticeKind = 'info' | 'error' | 'success'
export type Notify = (message: string, kind?: NoticeKind) => void
