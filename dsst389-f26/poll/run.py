"""Serve the course site locally so poll/index.html can resolve its ../css
and ../js relative links, and open it straight in the browser."""

import errno
import http.server
import functools
import sys
import webbrowser
import socketserver
from pathlib import Path

PORT = 8000
MAX_PORT_ATTEMPTS = 10
SITE_ROOT = Path(__file__).resolve().parent.parent  # dsst289-f26/ (parent of poll/)


def main():
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(SITE_ROOT)
    )

    httpd = None
    port = PORT
    for attempt in range(MAX_PORT_ATTEMPTS):
        port = PORT + attempt
        try:
            httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
            break
        except OSError as exc:
            if exc.errno != errno.EADDRINUSE:
                raise
            if attempt + 1 < MAX_PORT_ATTEMPTS:
                print(f"Port {port} is already in use, trying {port + 1}...")
            else:
                print(f"Port {port} is already in use.")

    if httpd is None:
        print(
            f"Could not find a free port in range {PORT}-{PORT + MAX_PORT_ATTEMPTS - 1}. "
            "Stop whatever is using them and try again.",
            file=sys.stderr,
        )
        sys.exit(1)

    with httpd:
        url = f"http://127.0.0.1:{port}/poll/index.html"
        print(f"Serving {SITE_ROOT!r} at {url}")
        print("Press Ctrl+C to stop.")
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
