from typing import Optional
from datetime import datetime
import json
from dataclasses import dataclass
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


@dataclass
class EditSession:
    user_id: int
    username: str
    display_name: str
    websocket: WebSocket
    started_at: datetime
    record_type: str  # 'blog_post' or 'page'
    record_id: int
    content_id: Optional[int] = None  # for specific content editing
    image_name: Optional[str] = None  # attachment filename for avatar


def _session_info(session: EditSession) -> dict:
    """Presence payload shape — kept compact because it's broadcast on every join/leave."""
    return {
        "user_id": session.user_id,
        "username": session.username,
        "display_name": session.display_name,
        "image_name": session.image_name,
        "started_at": session.started_at.isoformat(),
    }


class EditSessionManager:
    """Manages real-time editing sessions for presence (ambient avatars) and draft sync."""

    def __init__(self):
        # Structure: {record_key: {user_id: EditSession}}
        self.active_sessions: dict[str, dict[int, EditSession]] = {}

    def _get_record_key(
        self, record_type: str, record_id: int, content_id: Optional[int] = None
    ) -> str:
        if content_id:
            return f"{record_type}_content:{record_id}:{content_id}"
        return f"{record_type}:{record_id}"

    async def start_edit_session(self, session: EditSession) -> list[EditSession]:
        record_key = self._get_record_key(
            session.record_type, session.record_id, session.content_id
        )

        existing_sessions = self.active_sessions.get(record_key, {})

        # Replace an existing session for the same user — prevents duplicate tabs.
        if (
            record_key in self.active_sessions
            and session.user_id in self.active_sessions[record_key]
        ):
            prior = self.active_sessions[record_key][session.user_id]
            try:
                if prior.websocket and prior.websocket.client_state.name == "CONNECTED":
                    await prior.websocket.close()
            except Exception as e:
                logger.debug(f"Failed to close prior WebSocket: {e}")

        if record_key not in self.active_sessions:
            self.active_sessions[record_key] = {}
        self.active_sessions[record_key][session.user_id] = session

        await self._broadcast_presence(record_key)
        return [s for uid, s in existing_sessions.items() if uid != session.user_id]

    async def end_edit_session(
        self,
        user_id: int,
        record_type: str,
        record_id: int,
        content_id: Optional[int] = None,
    ):
        record_key = self._get_record_key(record_type, record_id, content_id)

        if record_key not in self.active_sessions:
            return
        if user_id not in self.active_sessions[record_key]:
            return

        session = self.active_sessions[record_key].pop(user_id)
        if not self.active_sessions[record_key]:
            del self.active_sessions[record_key]

        await self._broadcast_presence(record_key)

        try:
            if session.websocket and session.websocket.client_state.name == "CONNECTED":
                await session.websocket.close()
        except Exception as e:
            logger.debug(f"Failed to close WebSocket for user {user_id}: {e}")

    def end_edit_session_sync(
        self,
        user_id: int,
        record_type: str,
        record_id: int,
        content_id: Optional[int] = None,
    ):
        """Sync variant used by sendBeacon on page unload — no WS send, no close."""
        record_key = self._get_record_key(record_type, record_id, content_id)

        if record_key not in self.active_sessions:
            return
        if user_id not in self.active_sessions[record_key]:
            return

        del self.active_sessions[record_key][user_id]
        if not self.active_sessions[record_key]:
            del self.active_sessions[record_key]

    async def end_user_sessions(self, user_id: int):
        sessions_to_remove = []
        for record_key, sessions in self.active_sessions.items():
            if user_id in sessions:
                sessions_to_remove.append((record_key, user_id))
        for record_key, uid in sessions_to_remove:
            await self.end_edit_session(uid, *self._parse_record_key(record_key))

    def _parse_record_key(self, record_key: str) -> tuple:
        if "_content:" in record_key:
            parts = record_key.split(":")
            record_type = parts[0].replace("_content", "")
            return record_type, int(parts[1]), int(parts[2])
        parts = record_key.split(":")
        return parts[0], int(parts[1]), None

    async def _broadcast_presence(self, record_key: str):
        """Send every editor the current list of other editors.

        This is the single source of truth for the avatar row — one message
        type covers join, leave, and reconnect.
        """
        sessions = self.active_sessions.get(record_key, {})
        for user_id, session in sessions.items():
            others = [_session_info(s) for uid, s in sessions.items() if uid != user_id]
            if not session.websocket:
                continue
            try:
                await session.websocket.send_text(
                    json.dumps(
                        {
                            "type": "presence_update",
                            "editors": others,
                            "total_editors": len(sessions),
                        }
                    )
                )
            except Exception:
                logger.warning(f"Failed to send presence_update to user {user_id}")

    def get_active_editors(
        self, record_type: str, record_id: int, content_id: Optional[int] = None
    ) -> list[EditSession]:
        record_key = self._get_record_key(record_type, record_id, content_id)
        return list(self.active_sessions.get(record_key, {}).values())

    async def broadcast_to_editors(
        self,
        record_type: str,
        record_id: int,
        message: dict,
        content_id: Optional[int] = None,
        exclude_user_id: Optional[int] = None,
    ):
        record_key = self._get_record_key(record_type, record_id, content_id)
        sessions = self.active_sessions.get(record_key, {})

        for user_id, session in sessions.items():
            if exclude_user_id is not None and user_id == exclude_user_id:
                continue
            if session.websocket:
                try:
                    await session.websocket.send_text(json.dumps(message))
                except Exception:
                    logger.warning(f"Failed to broadcast to user {user_id}")


edit_session_manager = EditSessionManager()
