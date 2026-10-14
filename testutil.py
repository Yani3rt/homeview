"""Test helper: a throwaway config.json and data folder, so tests never touch the real ones."""
import json
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path

import config


@contextmanager
def temp_config(**over):
    """Point config.py at a temp config.json whose data_dir (and photos_dir) live in a temp folder."""
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        conf = {"data_dir": str(d / "data"), "photos_dir": str(d / "photos"), "wallpapers_dir": str(d / "walls"),
                "timezone": "America/Chicago", "location": {"name": "Test", "latitude": 41.0, "longitude": -87.0},
                "calendars": [], "sonos": {"enabled": False}}
        for k, v in over.items():
            conf[k] = v
        p = d / "config.json"
        p.write_text(json.dumps(conf))
        old = os.environ.get("HOMEVIEW_CONFIG")
        os.environ["HOMEVIEW_CONFIG"] = str(p)
        config._cache.update(path=None, mtime=None, value=None)
        try:
            yield d
        finally:
            if old is None:
                os.environ.pop("HOMEVIEW_CONFIG", None)
            else:
                os.environ["HOMEVIEW_CONFIG"] = old
            config._cache.update(path=None, mtime=None, value=None)
