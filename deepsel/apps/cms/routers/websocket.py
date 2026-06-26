from fastapi import (
    APIRouter,
    WebSocket,
    WebSocketDisconnect,
    Depends,
    HTTPException,
    Query,
)
from pydantic import BaseModel
from sqlalchemy.orm import Session
from deepsel.deps import get_db, settings
from deepsel.auth.get_current_user import get_current_user
from deepsel.utils.models_pool import models_pool
from ..utils.edit_session_manager import edit_session_manager, EditSession
from datetime import datetime
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix=settings.API_PREFIX, tags=["WebSocket APIs"])
UserModel = models_pool["user"]


async def get_current_user_websocket(
    websocket: WebSocket, token: Optional[str], db: Session
) -> UserModel:
    """Resolve the user for a WebSocket.

    Prefer the session cookie (browser admin uses cookie auth); fall back to the
    JWT token in the query string (mobile/hybrid clients store tokens in
    Capacitor Preferences).
    """
    from fastapi import status

    # 1. Session cookie — this is what the web admin uses.
    session_id = websocket.cookies.get(settings.SESSION_COOKIE_NAME)
    session_store = getattr(websocket.app.state, "session_store", None)
    if session_id and session_store:
        session_data = session_store.get(session_id)
        if session_data is not None:
            user = db.query(UserModel).get(session_data.user_id)
            if user:
                return user

    # 2. JWT token query param — hybrid/mobile clients.
    if token:
        import jwt
        from jwt import PyJWTError
        from settings import APP_SECRET, AUTH_ALGORITHM

        if token.startswith("Bearer "):
            token = token[7:]
        try:
            payload = jwt.decode(token, APP_SECRET, algorithms=[AUTH_ALGORITHM])
            user_id = payload.get("uid")
            if user_id:
                user = db.query(UserModel).filter(UserModel.id == user_id).first()
                if user:
                    return user
        except PyJWTError:
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
    )


@router.websocket("/ws/edit-session")
async def edit_session_websocket(
    websocket: WebSocket,
    record_type: str = Query(
        ..., description="Type of record being edited (blog_post or page)"
    ),
    record_id: int = Query(..., description="ID of the record being edited"),
    content_id: Optional[int] = Query(
        None, description="ID of the specific content being edited"
    ),
    token: Optional[str] = Query(
        None, description="Optional JWT token (cookie preferred)"
    ),
    db: Session = Depends(get_db),
):
    """WebSocket endpoint for managing edit sessions and parallel edit detection."""

    user = None
    try:
        # Authenticate user — session cookie first, then token fallback.
        user = await get_current_user_websocket(websocket, token, db)

        # Accept WebSocket connection
        await websocket.accept()

        # Create edit session
        full_name = " ".join(p for p in (user.first_name, user.last_name) if p).strip()
        display_name = user.name or full_name or user.username or user.email
        image_name = getattr(getattr(user, "image", None), "name", None)
        session = EditSession(
            user_id=user.id,
            username=user.username or user.email,
            display_name=display_name,
            websocket=websocket,
            started_at=datetime.utcnow(),
            record_type=record_type,
            record_id=record_id,
            content_id=content_id,
            image_name=image_name,
        )

        # Start edit session and check for conflicts
        await edit_session_manager.start_edit_session(session)

        try:
            while True:
                # Bail out if the socket was closed from elsewhere (e.g. a second
                # tab replacing this session). Otherwise receive_text() raises a
                # generic RuntimeError that would spin the loop.
                if websocket.client_state.name != "CONNECTED":
                    break

                try:
                    data = await websocket.receive_text()
                    message = json.loads(data)

                    # Handle different message types
                    if message.get("type") == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                    elif message.get("type") == "heartbeat":
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "heartbeat_response",
                                    "timestamp": datetime.utcnow().isoformat(),
                                }
                            )
                        )
                    elif message.get("type") == "leave_edit_session":
                        # User is explicitly leaving the edit session
                        logger.info(
                            f"User {user.id} explicitly leaving edit session for {record_type}:{record_id}"
                        )
                        await edit_session_manager.end_edit_session(
                            user.id, record_type, record_id, content_id
                        )
                        # Don't try to close WebSocket here - client is handling the disconnect
                        # Just break out of the loop to end the session cleanly
                        break

                except WebSocketDisconnect:
                    break
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON received from user {user.id}")
                    continue
                except Exception as e:
                    logger.error(f"Error handling WebSocket message: {e}")
                    break

        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected for user {user.id}")

    except HTTPException as e:
        logger.error(f"WebSocket connection error HTTPException: {e}")
        # Authentication failed
        await websocket.close(code=1008, reason="Authentication failed")
        return
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
        await websocket.close(code=1011, reason="Internal server error")
        return
    finally:
        # Clean up edit session — skip if auth failed before user was bound.
        if user is not None:
            try:
                await edit_session_manager.end_edit_session(
                    user.id, record_type, record_id, content_id
                )
            except Exception as e:
                logger.warning(f"Failed to end edit session for user {user.id}: {e}")


class LeaveEditSessionRequest(BaseModel):
    record_type: str
    record_id: int
    content_id: Optional[int] = None
    user_id: int


@router.post("/edit-session/leave")
def leave_edit_session_api(
    request: LeaveEditSessionRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """REST API endpoint for leaving edit session (used by sendBeacon on page unload)."""
    try:
        # Verify the user is authorized to end this session
        if request.user_id != current_user.id:
            raise HTTPException(
                status_code=403, detail="Cannot end other user's session"
            )

        logger.info(
            f"API: User {request.user_id} leaving edit session for {request.record_type}:{request.record_id}"
        )

        # Call the synchronous version of end_edit_session
        edit_session_manager.end_edit_session_sync(
            request.user_id, request.record_type, request.record_id, request.content_id
        )

        return {"status": "success", "message": "Edit session ended"}

    except Exception as e:
        logger.error(f"Error ending edit session via API: {e}")
        raise HTTPException(status_code=500, detail="Failed to end edit session")
