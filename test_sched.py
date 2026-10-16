"""Standby schedule logic (frame/hv/faces/sched.js), run under node. Skipped when node is not installed."""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

SCHED = Path(__file__).parent / "frame" / "hv" / "faces" / "sched.js"
ON = {"photos": 1, "info": 1, "today": 1, "week": 1, "weather": 1, "tomorrow": 1, "up": 1,
      "analog": 1, "numerals": 1, "minimal": 1, "night": 1, "month": 0, "alert": 1}


def run(body):
    js = ("global.window={};var store={};global.localStorage={getItem:function(k){return k in store?store[k]:null;},"
          "setItem:function(k,v){store[k]=String(v);},removeItem:function(k){delete store[k];}};"
          "require(" + json.dumps(str(SCHED)) + ");var S=window.HVSched,ON=" + json.dumps(ON) + ";"
          "console.log(JSON.stringify((function(){" + body + "})()));")
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


@unittest.skipUnless(shutil.which("node"), "node not installed")
class SchedTest(unittest.TestCase):
    def test_default_covers_every_day_and_skips_faces_that_are_off(self):
        s = run("return S.load(ON);")
        days = sorted(d for g in s["groups"] for d in g["days"])
        self.assertEqual(days, list(range(7)))
        for g in s["groups"]:
            for b in g["blocks"]:
                self.assertNotIn("month", b["faces"])
                self.assertNotIn("alert", b["faces"])
                self.assertTrue(b["faces"])

    def test_default_keeps_the_old_rules(self):
        r = run("var s=S.load(ON);return [S.at(s,2,6*60).block.faces[0], S.at(s,2,18*60).block.faces[0],"
                " S.at(s,0,16*60+30).block.faces[0], S.at(s,3,12*60).block.faces[0]];")
        self.assertEqual(r, ["weather", "tomorrow", "week", "photos"])

    def test_before_the_first_block_runs_yesterdays_last_block(self):
        r = run("var s=S.normalize({groups:[{days:[1,2,3,4,5],blocks:[{start:360,faces:['info']},{start:1320,faces:['analog']}]},"
                "{days:[6,0],blocks:[{start:480,faces:['photos']},{start:1200,faces:['minimal']}]}]},Object.keys(ON));"
                "return [S.at(s,1,60).block.faces, S.at(s,6,60).block.faces, S.at(s,6,7*60).block.faces, S.at(s,0,9*60).block.faces,"
                " S.endOf(s,0,1), S.endOf(s,0,0)];")
        self.assertEqual(r, [["minimal"], ["analog"], ["analog"], ["photos"], 360, 1320])

    def test_normalize_cleans_bad_input(self):
        s = run("return S.normalize({groups:[{days:[1,1,9,2],blocks:[{start:607,faces:['info','info','nope']},"
                "{start:600,faces:['up']},{start:5000,faces:['week']}]},{days:[],blocks:[]}]},Object.keys(ON));")
        self.assertEqual(len(s["groups"]), 1)
        self.assertEqual(s["groups"][0]["days"], [1, 2, 3, 4, 5, 6, 0])
        self.assertEqual(s["groups"][0]["blocks"], [{"start": 600, "faces": ["info"]}])

    def test_saved_schedule_wins_and_reset_restores_default(self):
        r = run("S.save({groups:[{days:[0,1,2,3,4,5,6],blocks:[{start:0,faces:['numerals']}]}]});"
                "var a=S.at(S.load(ON),3,700).block.faces;S.reset();return [a, S.load(ON).groups.length, S.saved()];")
        self.assertEqual(r, [["numerals"], 2, False])

    def test_night_block_has_the_night_clock_and_v1_schedules_get_it(self):
        r = run("var s=S.load(ON);return [S.isNight(s,2,23*60+30),S.isNight(s,3,3*60),S.isNight(s,3,6*60),S.isNight(s,6,1*60)];")
        self.assertEqual(r, [True, True, False, True])
        r = run("S.save({v:1,groups:[{days:[0,1,2,3,4,5,6],blocks:[{start:300,name:'Morning',faces:['info']},"
                "{start:1380,name:'Night',faces:['photos','analog']}]}]});var s=S.load(ON);"
                "return [s.v,s.groups[0].blocks[1].faces,s.groups[0].blocks[0].faces];")
        self.assertEqual(r, [2, ["night"], ["info"]])
        r = run("S.save({v:2,groups:[{days:[0,1,2,3,4,5,6],blocks:[{start:1380,name:'Night',faces:['analog']}]}]});"
                "return S.isNight(S.load(ON),1,23*60+30);")
        self.assertFalse(r)

    def test_labels(self):
        r = run("return [S.daysLabel([1,2,3,4,5]),S.daysLabel([6,0]),S.daysLabel([0,1,2,3,4,5,6]),S.daysLabel([1,2,3]),"
                "S.daysLabel([2,4]),S.daysLabel([0]),S.fmt(0),S.fmt(1035),S.blockName(300),S.blockName({start:1380}),S.blockName(S.load(ON).groups[0].blocks[1])];")
        self.assertEqual(r, ["Weekdays", "Weekend", "Every day", "Mon–Wed", "Tue, Thu", "Sunday",
                             "12:00 AM", "5:15 PM", "Morning", "Night", "Day"])


if __name__ == "__main__":
    unittest.main()
