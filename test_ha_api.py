"""ha_api: the entity list, state shaping and the action allow-list, with Home Assistant faked (no network)."""
import unittest
import ha_api as HA
import config
from testutil import temp_config

STATES = [
    {'entity_id': 'light.k', 'state': 'on', 'attributes': {'friendly_name': 'Kitchen', 'brightness': 128, 'supported_color_modes': ['brightness']}},
    {'entity_id': 'switch.c', 'state': 'off', 'attributes': {'friendly_name': 'Coffee'}},
    {'entity_id': 'climate.ac', 'state': 'cool', 'attributes': {'current_temperature': 76, 'temperature': 74, 'hvac_modes': ['off', 'cool'], 'min_temp': 60, 'max_temp': 86}},
    {'entity_id': 'binary_sensor.door', 'state': 'on', 'attributes': {'friendly_name': 'Door', 'device_class': 'door'}},
    {'entity_id': 'sensor.p', 'state': '412.0', 'attributes': {'friendly_name': 'Power', 'unit_of_measurement': 'W'}},
    {'entity_id': 'automation.n', 'state': 'off', 'attributes': {'friendly_name': 'Night'}},
    {'entity_id': 'scene.m', 'state': 'x', 'attributes': {}},
    {'entity_id': 'lock.front', 'state': 'locked', 'attributes': {}},
]
ENTS = [{'section': 'Kitchen'}, 'light.k', 'switch.c', {'entity': 'climate.ac', 'name': 'AC'}, 'binary_sensor.door',
        'sensor.p', 'automation.n', 'scene.m', 'light.gone', 'not an entity']


class HATest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.orig = HA._call
        def fake(conf, method, path, body=None):
            if path == '/api/states': return STATES
            if path == '/api/config': return {'unit_system': {'temperature': '°F'}}
            self.calls.append((path, body)); return []
        HA._call = fake
        HA._cache.update(at=0.0, key=None, unit=None)
        self.cm = temp_config(home_assistant={'url': 'http://ha:8123/', 'token': 'secret-token', 'entities': ENTS}); self.cm.__enter__()
    def tearDown(self):
        HA._call = self.orig; self.cm.__exit__(None, None, None)

    def test_disabled_without_token(self):
        with temp_config(home_assistant={'url': 'http://ha:8123'}):
            self.assertFalse(HA.state_doc()['enabled']); self.assertFalse(config.public()['ha'])

    def test_public_config_hides_token(self):
        pub = config.public(); self.assertTrue(pub['ha']); self.assertNotIn('secret-token', repr(pub))

    def test_state_doc(self):
        d = HA.state_doc(); items = {i.get('id'): i for i in d['items']}
        self.assertEqual(d['items'][0], {'kind': 'section', 'name': 'Kitchen'})
        self.assertEqual(items['light.k']['state'], 'On · 50%'); self.assertTrue(items['light.k']['dimmable'])
        self.assertEqual(items['climate.ac']['name'], 'AC'); self.assertEqual((items['climate.ac']['cur'], items['climate.ac']['set']), (76, 74))
        self.assertEqual(items['binary_sensor.door']['state'], 'Open')
        self.assertEqual(items['sensor.p']['state'], '412 W')
        self.assertEqual(items['automation.n']['state'], 'Disabled')
        self.assertEqual(items['light.gone']['kind'], 'missing')
        self.assertNotIn('not an entity', repr(d))

    def test_actions_allowed(self):
        HA.action({'entity': 'light.k', 'action': 'brightness', 'value': 40})
        HA.action({'entity': 'automation.n', 'action': 'enable'})
        HA.action({'entity': 'scene.m', 'action': 'run'})
        HA.action({'entity': 'climate.ac', 'action': 'temp', 'value': 72})
        HA.action({'entity': 'climate.ac', 'action': 'mode', 'value': 'off'})
        self.assertEqual([c[0] for c in self.calls], ['/api/services/light/turn_on', '/api/services/automation/turn_on',
            '/api/services/scene/turn_on', '/api/services/climate/set_temperature', '/api/services/climate/set_hvac_mode'])
        self.assertEqual(self.calls[0][1], {'entity_id': 'light.k', 'brightness_pct': 40})

    def test_actions_refused(self):
        for p in ({'entity': 'lock.front', 'action': 'toggle'},           # not on the list
                  {'entity': 'sensor.p', 'action': 'toggle'},             # read-only
                  {'entity': 'switch.c', 'action': 'run'},                # wrong action for the kind
                  {'entity': 'climate.ac', 'action': 'temp', 'value': 120},
                  {'entity': 'climate.ac', 'action': 'mode', 'value': 'heat'},
                  {'entity': 'light.k', 'action': 'brightness', 'value': 0}):
            with self.assertRaises((ValueError, TypeError)):
                HA.action(p)
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
