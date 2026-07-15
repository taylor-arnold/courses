"""Serve the course site locally so poll/index.html can resolve its ../css
and ../js relative links, and open it straight in the browser."""

import http.server
import functools
import webbrowser
import socketserver
from pathlib import Path

PORT = 8000
SITE_ROOT = Path(__file__).resolve().parent.parent  # dsst289-f26/ (parent of poll/)


def main():
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(SITE_ROOT)
    )

    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        url = f"http://127.0.0.1:{PORT}/poll/index.html"
        print(f"Serving {SITE_ROOT!r} at {url}")
        print("Press Ctrl+C to stop.")
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
