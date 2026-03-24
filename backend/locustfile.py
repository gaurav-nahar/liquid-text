"""
Locust Load Test for LiquidText Clone Backend
=============================================
Run:
    locust -f locustfile.py --host=http://localhost:8000

Then open: http://localhost:8089
"""

from locust import HttpUser, task, between, events
import random
import json

# ── Shared test data ──────────────────────────────────────────
TEST_PDF_NAME = "test_document.pdf"
TEST_PDF_PATH = "test_document.pdf"
TEST_USER_IDS = [f"load_test_user_{i}" for i in range(1, 21)]  # 20 virtual users


# ── Helper ────────────────────────────────────────────────────
def random_user():
    return random.choice(TEST_USER_IDS)


# ══════════════════════════════════════════════════════════════
# USER 1: Read-Only User
# Simulates someone just viewing a PDF and its annotations
# Weight = 5 (most common)
# ══════════════════════════════════════════════════════════════
class ReadOnlyUser(HttpUser):
    weight = 5
    wait_time = between(1, 3)

    def on_start(self):
        """Called once when user starts — open/register the PDF"""
        self.user_id = random_user()
        self.headers = {"X-User-ID": self.user_id}
        self.pdf_id = None
        self.workspace_id = None
        self._open_pdf()

    def _open_pdf(self):
        with self.client.post(
            "/pdfs/open",
            json={"name": TEST_PDF_NAME, "path": TEST_PDF_PATH},
            headers=self.headers,
            name="/pdfs/open",
            catch_response=True,
        ) as res:
            if res.status_code == 200:
                self.pdf_id = res.json().get("id")
            else:
                res.failure(f"Failed to open PDF: {res.status_code}")
                return

        if self.pdf_id:
            ws_res = self.client.get(
                f"/workspace/list/{self.pdf_id}",
                headers=self.headers,
                name="/workspace/list/{pdf_id}",
            )
            if ws_res.status_code == 200:
                ws_list = ws_res.json()
                if ws_list:
                    self.workspace_id = ws_list[0]["id"]

    @task(4)
    def load_highlights(self):
        if not self.pdf_id:
            return
        self.client.get(
            f"/highlights/pdf/{self.pdf_id}",
            headers=self.headers,
            name="/highlights/pdf/{pdf_id}",
        )

    @task(4)
    def load_workspace_data(self):
        if not self.pdf_id or not self.workspace_id:
            return
        # Load all workspace data in parallel (as the frontend does)
        endpoints = [
            f"/snippets/pdf/{self.pdf_id}/{self.workspace_id}",
            f"/boxes/pdf/{self.pdf_id}/{self.workspace_id}",
            f"/lines/pdf/{self.pdf_id}/{self.workspace_id}",
            f"/connections/pdf/{self.pdf_id}/{self.workspace_id}",
        ]
        for url in endpoints:
            self.client.get(
                url,
                headers=self.headers,
                name=url.replace(str(self.pdf_id), "{pdf_id}").replace(str(self.workspace_id), "{ws_id}"),
            )

    @task(3)
    def load_pdf_annotations(self):
        if not self.pdf_id:
            return
        self.client.get(
            f"/pdf_texts/pdf/{self.pdf_id}",
            headers=self.headers,
            name="/pdf_texts/pdf/{pdf_id}",
        )
        self.client.get(
            f"/pdf_drawing_lines/pdf/{self.pdf_id}",
            headers=self.headers,
            name="/pdf_drawing_lines/pdf/{pdf_id}",
        )
        self.client.get(
            f"/pdf_brush_highlights/pdf/{self.pdf_id}",
            headers=self.headers,
            name="/pdf_brush_highlights/pdf/{pdf_id}",
        )

    @task(2)
    def get_pdf_info(self):
        if not self.pdf_id:
            return
        self.client.get(
            f"/pdfs/{self.pdf_id}",
            headers=self.headers,
            name="/pdfs/{pdf_id}",
        )

    @task(1)
    def list_workspaces(self):
        if not self.pdf_id:
            return
        self.client.get(
            f"/workspace/list/{self.pdf_id}",
            headers=self.headers,
            name="/workspace/list/{pdf_id}",
        )


# ══════════════════════════════════════════════════════════════
# USER 2: Active Annotator
# Simulates someone actively highlighting and saving
# Weight = 3
# ══════════════════════════════════════════════════════════════
class ActiveAnnotatorUser(HttpUser):
    weight = 3
    wait_time = between(2, 5)

    def on_start(self):
        self.user_id = random_user()
        self.headers = {"X-User-ID": self.user_id}
        self.pdf_id = None
        self.workspace_id = None
        self.created_highlight_ids = []
        self._setup()

    def _setup(self):
        res = self.client.post(
            "/pdfs/open",
            json={"name": TEST_PDF_NAME, "path": TEST_PDF_PATH},
            headers=self.headers,
            name="/pdfs/open",
        )
        if res.status_code == 200:
            self.pdf_id = res.json().get("id")

        if self.pdf_id:
            ws_res = self.client.get(
                f"/workspace/list/{self.pdf_id}",
                headers=self.headers,
                name="/workspace/list/{pdf_id}",
            )
            if ws_res.status_code == 200:
                ws_list = ws_res.json()
                if ws_list:
                    self.workspace_id = ws_list[0]["id"]

    @task(5)
    def save_annotations(self):
        """Simulate saving highlights + drawings (like clicking Save button)"""
        if not self.pdf_id:
            return

        page_num = random.randint(1, 10)
        highlights = [
            {
                "id": f"temp-{random.randint(1000, 9999)}",
                "page_num": page_num,
                "color": random.choice(["#FFEB3B", "#4CAF50", "#FF4081", "#2196F3"]),
                "x_pct": round(random.uniform(0.1, 0.8), 4),
                "y_pct": round(random.uniform(0.1, 0.8), 4),
                "width_pct": round(random.uniform(0.05, 0.3), 4),
                "height_pct": round(random.uniform(0.01, 0.05), 4),
                "content": "Sample highlighted text for load testing",
            }
        ]
        pdf_texts = [
            {
                "id": f"pdf-annot-{random.randint(1000, 9999)}",
                "page_num": page_num,
                "text": "Load test annotation",
                "x_pct": round(random.uniform(0.1, 0.8), 4),
                "y_pct": round(random.uniform(0.1, 0.8), 4),
            }
        ]

        with self.client.post(
            f"/pdfs/{self.pdf_id}/save_annotations",
            json={
                "highlights": highlights,
                "pdf_texts": pdf_texts,
                "pdf_drawing_lines": [],
                "brush_highlights": [],
            },
            headers=self.headers,
            name="/pdfs/{pdf_id}/save_annotations",
            catch_response=True,
        ) as res:
            if res.status_code != 200:
                res.failure(f"Save failed: {res.status_code} - {res.text}")

    @task(3)
    def create_snippet(self):
        """Simulate dragging a snippet to workspace"""
        if not self.pdf_id or not self.workspace_id:
            return
        self.client.post(
            "/snippets/",
            json={
                "pdf_id": self.pdf_id,
                "workspace_id": self.workspace_id,
                "type": "text",
                "x": random.uniform(100, 800),
                "y": random.uniform(100, 600),
                "width": 200,
                "height": 100,
                "page": random.randint(1, 5),
                "content": "Load test snippet content",
                "x_pct": 0.1, "y_pct": 0.1,
                "width_pct": 0.2, "height_pct": 0.05,
            },
            headers=self.headers,
            name="/snippets/",
        )

    @task(2)
    def add_text_box(self):
        if not self.pdf_id or not self.workspace_id:
            return
        self.client.post(
            "/boxes/",
            json={
                "pdf_id": self.pdf_id,
                "workspace_id": self.workspace_id,
                "text": "Load test text box",
                "x": random.uniform(100, 700),
                "y": random.uniform(100, 500),
                "width": 180,
                "height": 80,
                "page": 1,
            },
            headers=self.headers,
            name="/boxes/",
        )

    @task(1)
    def load_all_data(self):
        """Re-load workspace (simulates page refresh)"""
        if not self.pdf_id or not self.workspace_id:
            return
        self.client.get(
            f"/snippets/pdf/{self.pdf_id}/{self.workspace_id}",
            headers=self.headers,
            name="/snippets/pdf/{pdf_id}/{ws_id}",
        )


# ══════════════════════════════════════════════════════════════
# USER 3: Summary User
# Simulates someone clicking the AI Summarize button
# Weight = 1 (least frequent — heavy API call)
# ══════════════════════════════════════════════════════════════
class SummaryUser(HttpUser):
    weight = 1
    wait_time = between(10, 30)  # Summary users wait longer between requests

    def on_start(self):
        self.user_id = random_user()
        self.headers = {"X-User-ID": self.user_id}

    @task
    def summarize_pdf(self):
        """Simulate clicking the book/summary button"""
        sample_text = (
            "This is a sample PDF document for load testing purposes. "
            "It contains information about software architecture, design patterns, "
            "and best practices for building scalable web applications. "
            "The document covers topics such as microservices, REST APIs, "
            "database optimization, and frontend performance. " * 20
        )
        with self.client.post(
            "/pdfs/summarize",
            json={"text": sample_text},
            headers=self.headers,
            name="/pdfs/summarize",
            catch_response=True,
            timeout=90,
        ) as res:
            if res.status_code == 200:
                if "summary" not in res.json():
                    res.failure("Response missing 'summary' key")
            else:
                res.failure(f"Summarize failed: {res.status_code}")


# ══════════════════════════════════════════════════════════════
# EVENT HOOKS — print summary at end
# ══════════════════════════════════════════════════════════════
@events.quitting.add_listener
def on_quitting(environment, **kwargs):
    stats = environment.stats.total
    print("\n" + "=" * 55)
    print("  LOCUST LOAD TEST SUMMARY")
    print("=" * 55)
    print(f"  Total Requests     : {stats.num_requests}")
    print(f"  Total Failures     : {stats.num_failures}")
    print(f"  Failure Rate       : {stats.fail_ratio * 100:.2f}%")
    print(f"  Avg Response Time  : {stats.avg_response_time:.1f} ms")
    print(f"  95th Percentile    : {stats.get_response_time_percentile(0.95):.1f} ms")
    print(f"  Max Response Time  : {stats.max_response_time:.1f} ms")
    print(f"  Requests/sec (RPS) : {stats.current_rps:.2f}")
    print("=" * 55)
    if stats.fail_ratio > 0.01:
        print("  ⚠  WARNING: Failure rate > 1% — server is struggling")
    elif stats.avg_response_time > 1000:
        print("  ⚠  WARNING: Avg response > 1s — server is slow under load")
    else:
        print("  ✓  Server handled this load well")
    print("=" * 55 + "\n")
