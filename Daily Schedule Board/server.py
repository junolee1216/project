import json
import mimetypes
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "discord-config.json"
REMINDERS_PATH = ROOT / "reminders.json"
PORT = int(os.environ.get("PORT", "5179"))
RETRY_DELAYS_SECONDS = [5, 30, 120, 300, 900]
reminder_lock = threading.Lock()


def load_webhook_url():
    environment_url = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if environment_url:
        return normalize_webhook_url(environment_url)

    if not CONFIG_PATH.exists():
        return ""

    try:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return normalize_webhook_url(str(config.get("webhookUrl", "")).strip())
    except (OSError, ValueError):
        return ""


def normalize_webhook_url(url):
    return url.replace("https://discordapp.com/", "https://discord.com/", 1)


def load_reminders():
    if not REMINDERS_PATH.exists():
        return {}

    try:
        reminders = json.loads(REMINDERS_PATH.read_text(encoding="utf-8"))
        if not isinstance(reminders, dict):
            return {}

        for reminder in reminders.values():
            if reminder.get("status") == "sending":
                reminder["status"] = "pending"
        return reminders
    except (OSError, ValueError):
        return {}


def save_reminders(reminders):
    temporary_path = REMINDERS_PATH.with_suffix(".tmp")
    temporary_path.write_text(
        json.dumps(reminders, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary_path.replace(REMINDERS_PATH)


reminders = load_reminders()


def send_discord_message(task_title, reminder_type):
    webhook_url = load_webhook_url()
    if not webhook_url:
        raise RuntimeError("Discord webhook is not configured.")

    separator = "&" if "?" in webhook_url else "?"
    request_url = f"{webhook_url}{separator}wait=true"
    discord_body = json.dumps(
        {
            "content": f"@everyone ⏰ {reminder_type}: {task_title}",
            "allowed_mentions": {
                "parse": ["everyone"]
            },
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        request_url,
        data=discord_body,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "DailyScheduleBoard/1.0",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status not in (200, 204):
            raise urllib.error.HTTPError(
                request_url,
                response.status,
                "Discord rejected the message.",
                response.headers,
                None,
            )


def process_due_reminders():
    while True:
        now = int(time.time() * 1000)
        due_reminder_ids = []

        with reminder_lock:
            for reminder_id, reminder in reminders.items():
                if (
                    reminder.get("status") == "pending"
                    and int(reminder.get("nextAttemptAt", reminder.get("dueAt", 0))) <= now
                ):
                    reminder["status"] = "sending"
                    due_reminder_ids.append(reminder_id)
            if due_reminder_ids:
                save_reminders(reminders)

        for reminder_id in due_reminder_ids:
            with reminder_lock:
                reminder = dict(reminders.get(reminder_id, {}))

            if not reminder:
                continue

            try:
                send_discord_message(reminder["taskTitle"], reminder["type"])
            except (OSError, RuntimeError, urllib.error.URLError, TimeoutError) as error:
                with reminder_lock:
                    current = reminders.get(reminder_id)
                    if not current or current.get("status") != "sending":
                        continue

                    attempts = int(current.get("attempts", 0)) + 1
                    delay_index = min(attempts - 1, len(RETRY_DELAYS_SECONDS) - 1)
                    current["attempts"] = attempts
                    current["lastError"] = str(error)
                    current["nextAttemptAt"] = int(time.time() * 1000) + RETRY_DELAYS_SECONDS[delay_index] * 1000
                    current["status"] = "pending"
                    save_reminders(reminders)
            else:
                with reminder_lock:
                    current = reminders.get(reminder_id)
                    if not current or current.get("status") != "sending":
                        continue

                    current["status"] = "delivered"
                    current["deliveredAt"] = int(time.time() * 1000)
                    current["lastError"] = None
                    save_reminders(reminders)

        time.sleep(1)


class ScheduleBoardHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        relative_path = path.split("?", 1)[0].split("#", 1)[0].lstrip("/")
        requested_path = (ROOT / relative_path).resolve()
        if not requested_path.is_relative_to(ROOT):
            return str(ROOT / "__forbidden__")
        return str(requested_path)

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == "/":
            self.path = "/index.html"
            super().do_GET()
            return

        if parsed_path.path == "/api/reminders":
            query = urllib.parse.parse_qs(parsed_path.query)
            requested_ids = set(query.get("id", []))
            with reminder_lock:
                selected = {
                    reminder_id: reminder
                    for reminder_id, reminder in reminders.items()
                    if not requested_ids or reminder_id in requested_ids
                }
            self.send_json(200, {"ok": True, "reminders": selected})
            return

        super().do_GET()

    def do_POST(self):
        if self.path == "/api/reminders":
            self.schedule_reminder()
            return

        if self.path == "/api/reminders/cancel":
            self.cancel_reminder()
            return

        if self.path == "/api/discord-reminder":
            self.send_immediate_reminder()
            return

        self.send_error(404)

    def read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(content_length).decode("utf-8"))

    def schedule_reminder(self):
        try:
            body = self.read_json_body()
            reminder_id = str(body.get("reminderId", "")).strip()
            task_title = str(body.get("taskTitle", "")).strip()
            reminder_type = str(body.get("type", "")).strip()
            due_at = int(body.get("dueAt", 0))
        except (ValueError, TypeError, UnicodeDecodeError):
            self.send_json(400, {"ok": False, "error": "Invalid request."})
            return

        if not reminder_id or not task_title or reminder_type not in ("Alarm", "Timer finished"):
            self.send_json(400, {"ok": False, "error": "Reminder data is incomplete."})
            return

        if due_at <= int(time.time() * 1000):
            self.send_json(400, {"ok": False, "error": "Reminder time must be in the future."})
            return

        with reminder_lock:
            existing = reminders.get(reminder_id)
            unchanged = (
                existing
                and existing.get("taskTitle") == task_title
                and existing.get("type") == reminder_type
                and int(existing.get("dueAt", 0)) == due_at
                and existing.get("status") in ("pending", "sending", "delivered")
            )

            if not unchanged:
                reminders[reminder_id] = {
                    "reminderId": reminder_id,
                    "taskTitle": task_title,
                    "type": reminder_type,
                    "dueAt": due_at,
                    "nextAttemptAt": due_at,
                    "attempts": 0,
                    "status": "pending",
                    "createdAt": int(time.time() * 1000),
                    "lastError": None,
                }
                save_reminders(reminders)

            reminder = reminders[reminder_id]

        self.send_json(200, {"ok": True, "reminder": reminder})

    def cancel_reminder(self):
        try:
            body = self.read_json_body()
            reminder_id = str(body.get("reminderId", "")).strip()
        except (ValueError, UnicodeDecodeError):
            self.send_json(400, {"ok": False, "error": "Invalid request."})
            return

        if not reminder_id:
            self.send_json(400, {"ok": False, "error": "Reminder ID is required."})
            return

        with reminder_lock:
            removed = reminders.pop(reminder_id, None)
            if removed is not None:
                save_reminders(reminders)

        self.send_json(200, {"ok": True, "removed": removed is not None})

    def send_immediate_reminder(self):
        try:
            body = self.read_json_body()
            task_title = str(body.get("taskTitle", "")).strip()
            reminder_type = str(body.get("type", "Timer")).strip()
        except (ValueError, UnicodeDecodeError):
            self.send_json(400, {"ok": False, "error": "Invalid request."})
            return

        if not task_title:
            self.send_json(400, {"ok": False, "error": "Task title is required."})
            return

        try:
            send_discord_message(task_title, reminder_type)
        except (OSError, RuntimeError, urllib.error.URLError, TimeoutError):
            self.send_json(502, {"ok": False, "error": "Discord notification failed."})
            return

        self.send_json(200, {"ok": True})

    def send_json(self, status, payload):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def guess_type(self, path):
        return mimetypes.guess_type(path)[0] or "application/octet-stream"


if __name__ == "__main__":
    reminder_thread = threading.Thread(target=process_due_reminders, daemon=True)
    reminder_thread.start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), ScheduleBoardHandler)
    print(f"Daily Schedule Board: http://127.0.0.1:{PORT}")
    server.serve_forever()
