"""Client process manager - controls the Astro Node.js process lifecycle."""

import atexit
import logging
import os
import signal
import subprocess  # nosec B404
import threading
from platformdirs import user_data_dir
from deepsel.deps import settings

logger = logging.getLogger(__name__)


class ClientProcessManager:
    """Thread-safe singleton that manages the Astro standalone Node.js process."""

    _instance = None
    _cls_lock = threading.Lock()

    def __new__(cls):
        with cls._cls_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._process: subprocess.Popen | None = None
        self._process_lock = threading.RLock()
        self._shutting_down = False
        self._cleanup_registered = False
        self._initialized = True

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self):
        """Start the Astro client if not already running."""
        with self._process_lock:
            if self._shutting_down:
                logger.info("Shutdown in progress, not starting client")
                return
            if self._process is not None and self._process.poll() is None:
                logger.info("Client already running (PID %d)", self._process.pid)
                return
            self._start_process()

    def stop(self, timeout: float = 5.0):
        """Stop the client gracefully: SIGTERM → wait → SIGKILL."""
        with self._process_lock:
            self._stop_process(timeout)

    def restart(self, timeout: float = 5.0):
        """Atomic stop-then-start under a single lock acquisition."""
        with self._process_lock:
            if self._shutting_down:
                logger.info("Shutdown in progress, not restarting client")
                return
            self._stop_process(timeout)
            self._start_process()

    def shutdown(self, timeout: float = 5.0):
        """Mark as shutting down and stop. Prevents further starts."""
        with self._process_lock:
            self._shutting_down = True
            self._stop_process(timeout)

    @property
    def is_running(self) -> bool:
        with self._process_lock:
            return self._process is not None and self._process.poll() is None

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _start_process(self):
        """Launch the Node process. Caller must hold _process_lock."""
        data_dir = user_data_dir("deepsel-cms", "deepsel")
        entry_path = os.path.join(data_dir, "client", "dist", "server", "entry.mjs")

        if not os.path.exists(entry_path):
            logger.warning("Client entry not found at %s, skipping start", entry_path)
            return

        host = (
            settings.CLIENT_HOST
            if settings
            else os.getenv("CLIENT_HOST", "0.0.0.0")  # nosec B104
        )
        port = settings.CLIENT_PORT if settings else os.getenv("CLIENT_PORT", "4321")

        # Kill any orphaned process from a previous run
        self._kill_stale_port(int(port))

        env = os.environ.copy()
        env["HOST"] = host
        env["PORT"] = port

        logger.info("Starting Astro client on %s:%s ...", host, port)

        self._process = subprocess.Popen(  # nosec B603 B607
            ["node", entry_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            preexec_fn=os.setsid if os.name != "nt" else None,
        )

        # Daemon threads stream child output into Python logging
        for pipe, name in [
            (self._process.stdout, "client.stdout"),
            (self._process.stderr, "client.stderr"),
        ]:
            t = threading.Thread(
                target=self._stream_output, args=(pipe, name), daemon=True
            )
            t.start()

        logger.info("Astro client started (PID %d)", self._process.pid)

        # Register cleanup handlers once so the child is killed on unexpected exit
        if not self._cleanup_registered:
            atexit.register(self._atexit_cleanup)
            for sig in (signal.SIGHUP, signal.SIGTERM):
                prev = signal.getsignal(sig)
                signal.signal(sig, self._make_signal_handler(prev))
            self._cleanup_registered = True

    def _stop_process(self, timeout: float = 5.0):
        """Stop the running process. Caller must hold _process_lock."""
        if self._process is None:
            return

        if self._process.poll() is not None:
            logger.info(
                "Client process already exited (code %d)", self._process.returncode
            )
            self._process = None
            return

        pid = self._process.pid
        logger.info("Stopping Astro client (PID %d) ...", pid)

        try:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            self._process = None
            return

        try:
            self._process.wait(timeout=timeout)
            logger.info("Client process stopped gracefully")
        except subprocess.TimeoutExpired:
            logger.warning("Client did not stop within %ss, sending SIGKILL", timeout)
            try:
                os.killpg(os.getpgid(pid), signal.SIGKILL)
                self._process.wait(timeout=2)
            except (ProcessLookupError, PermissionError, subprocess.TimeoutExpired):
                pass
            logger.info("Client process killed")

        self._process = None

    def _atexit_cleanup(self):
        """Called by atexit — best-effort kill of the child process."""
        try:
            self.shutdown(timeout=3)
        except Exception:  # nosec B110
            pass

    def _make_signal_handler(self, prev_handler):
        """Return a signal handler that shuts down the client then chains."""

        def handler(signum, frame):
            try:
                self.shutdown(timeout=3)
            except Exception:  # nosec B110
                pass
            # Chain to the previous handler
            if callable(prev_handler) and prev_handler not in (
                signal.SIG_DFL,
                signal.SIG_IGN,
            ):
                prev_handler(signum, frame)
            else:
                raise SystemExit(128 + signum)

        return handler

    @staticmethod
    def _kill_stale_port(port: int):
        """Kill any process listening on the given port (handles orphans)."""
        if os.name == "nt":
            return
        try:
            result = subprocess.run(  # nosec B603 B607
                ["lsof", "-ti", f":{port}"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            pids = result.stdout.strip()
            if pids:
                for pid_str in pids.split("\n"):
                    pid = int(pid_str.strip())
                    if pid != os.getpid():
                        logger.info(
                            "Killing stale process on port %d (PID %d)", port, pid
                        )
                        os.kill(pid, signal.SIGKILL)
        except Exception:  # nosec B110
            pass

    @staticmethod
    def _stream_output(pipe, logger_name: str):
        """Read lines from a pipe and log them. Runs in a daemon thread."""
        log = logging.getLogger(logger_name)
        try:
            for line in iter(pipe.readline, b""):
                text = line.decode("utf-8", errors="replace").rstrip()
                if text:
                    log.info(text)
        except (ValueError, OSError):
            pass  # Pipe closed during shutdown
        finally:
            try:
                pipe.close()
            except Exception:  # nosec B110
                pass


def get_client_manager() -> ClientProcessManager | None:
    """Get the singleton, or None if client management is disabled."""
    if settings.NO_CLIENT:
        return None
    return ClientProcessManager()
