import { supabase } from './supabase'
import type { ChatMessage, Member, QueueItem, Room } from './types'

/**
 * Thin wrappers around the database. All permission checks live in supabase/schema.sql
 * (Row Level Security + functions), never here - this file only makes the calls.
 * Every function throws the raw Supabase error; show it with friendlyError().
 */

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

// ---- rooms & membership -----------------------------------------------------------------

export const createRoom = (name: string, avatar: string) =>
  rpc<Room>('create_room', { p_name: name, p_avatar: avatar })

export const joinRoom = (code: string, name: string, avatar: string) =>
  rpc<Room>('join_room', { p_code: code, p_name: name, p_avatar: avatar })

export const leaveRoom = (roomId: string) => rpc<null>('leave_room', { p_room: roomId })
export const touchMember = (roomId: string) => rpc<null>('touch_member', { p_room: roomId })
export const transferHost = (roomId: string, newHost: string) =>
  rpc<null>('transfer_host', { p_room: roomId, p_new_host: newHost })
export const claimHost = (roomId: string) => rpc<Room>('claim_host', { p_room: roomId })
export const serverTime = () => rpc<string>('server_time')

// ---- playback (host only, enforced by the database) --------------------------------------

export const setPlayback = (roomId: string, playing: boolean, position: number) =>
  rpc<Room>('set_playback', { p_room: roomId, p_playing: playing, p_position: position })

export const loadVideo = (roomId: string, videoId: string, title: string | null) =>
  rpc<Room>('load_video', { p_room: roomId, p_video_id: videoId, p_title: title })

export const playNext = (roomId: string) => rpc<Room>('play_next', { p_room: roomId })
export const playQueueItem = (itemId: string) => rpc<Room>('play_queue_item', { p_item: itemId })

export const setVideoTitle = (roomId: string, videoId: string, title: string) =>
  rpc<null>('set_video_title', { p_room: roomId, p_video_id: videoId, p_title: title })

// ---- reads --------------------------------------------------------------------------------

export async function fetchRoom(roomId: string): Promise<Room> {
  const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single()
  if (error) throw error
  return data as Room
}

export async function fetchMembers(roomId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('room_members')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at')
  if (error) throw error
  return data as Member[]
}

export async function fetchMessages(roomId: string, limit = 200): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as ChatMessage[]).reverse()
}

export async function fetchQueue(roomId: string): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from('queue_items')
    .select('*')
    .eq('room_id', roomId)
    .order('seq')
  if (error) throw error
  return data as QueueItem[]
}

// ---- writes through row-level security ----------------------------------------------------

export async function sendMessage(roomId: string, userId: string, body: string): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ room_id: roomId, user_id: userId, body })
    .select()
    .single()
  if (error) throw error
  return data as ChatMessage
}

export async function addToQueue(
  roomId: string,
  userId: string,
  videoId: string,
  title: string | null,
): Promise<QueueItem> {
  const { data, error } = await supabase
    .from('queue_items')
    .insert({ room_id: roomId, added_by: userId, video_id: videoId, title })
    .select()
    .single()
  if (error) throw error
  return data as QueueItem
}

export async function removeFromQueue(itemId: string): Promise<void> {
  const { error } = await supabase.from('queue_items').delete().eq('id', itemId)
  if (error) throw error
}
