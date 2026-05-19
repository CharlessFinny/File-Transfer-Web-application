import threading
import webview
from app import app
import time


def run_flask():
    app.run(port=5000, debug=False, use_reloader=False)


if __name__ == '__main__':
    t = threading.Thread(target=run_flask)
    t.daemon = True
    t.start()

    time.sleep(2)

    webview.create_window(
        "File Transfer App",
        "http://127.0.0.1:5000/register",
        width=1200,
        height=800
    )

    webview.start(gui='edgechromium')