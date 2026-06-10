"""
WebSocket connection manager for real-time push notifications.
Broadcasts active downtime events to all connected clients.
"""
import asyncio
import logging
from typing import Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info(f"WS connected. Total: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self.active_connections.discard(websocket)
        logger.info(f"WS disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Send message to all connected clients."""
        async with self._lock:
            connections = list(self.active_connections)
        logger.info(f"WS broadcast: type={message.get('type')}, connections={len(connections)}")
        if not connections:
            return
        # Send without lock to avoid blocking
        dead = []
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.debug(f"WS send failed: {e}")
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self.active_connections.discard(ws)


manager = ConnectionManager()


def get_manager() -> ConnectionManager:
    return manager
