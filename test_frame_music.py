"""Music backend tests: fakes only, no speaker is ever contacted.

The favorites fixture has the shape of a real Sonos favorites list (ContentDirectory Browse FV:2), with
sample titles, parsed by soco's own DIDL parser, plus one TuneIn station. Four of the six favorites are
Sonos app "shortcuts" with an empty <res>.
"""
import unittest
from unittest.mock import patch
import frame_api as F
from soco.data_structures_entry import from_didl_string
from soco.exceptions import SoCoUPnPException

FAVORITES_DIDL = '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="FV:2/1" parentID="FV:2" restricted="false"><dc:title>Discover Sonos Radio</dc:title><upnp:class>object.itemobject.item.sonos-favorite</upnp:class><r:ordinal>0</r:ordinal><res></res><r:type>shortcut</r:type><r:description>From Sonos Radio</r:description><r:resMD>&lt;DIDL-Lite xmlns:dc=&quot;http://purl.org/dc/elements/1.1/&quot; xmlns:upnp=&quot;urn:schemas-upnp-org:metadata-1-0/upnp/&quot; xmlns:r=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot; xmlns=&quot;urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/&quot;&gt;&lt;item id=&quot;10fe0044%2fstations%2fen-US%2fUS%2fc2Q6VVM6ZGlzY292ZXItc29ub3MtcmFkaW8&quot; parentID=&quot;00080004%2fstations%2fen-US%2fUS%2fc2Q6VVM6ZGlzY292ZXItc29ub3MtcmFkaW8&quot; restricted=&quot;true&quot;&gt;&lt;dc:title&gt;&lt;/dc:title&gt;&lt;upnp:class&gt;object.container&lt;/upnp:class&gt;&lt;desc id=&quot;cdudn&quot; nameSpace=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot;&gt;SA_RINCON77575_X_#Svc77575-0-Token&lt;/desc&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;</r:resMD></item><item id="FV:2/4" parentID="FV:2" restricted="false"><dc:title>Favorites</dc:title><upnp:class>object.itemobject.item.sonos-favorite</upnp:class><r:ordinal>1</r:ordinal><res></res><r:type>shortcut</r:type><r:description>From Sonos Radio</r:description><r:resMD>&lt;DIDL-Lite xmlns:dc=&quot;http://purl.org/dc/elements/1.1/&quot; xmlns:upnp=&quot;urn:schemas-upnp-org:metadata-1-0/upnp/&quot; xmlns:r=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot; xmlns=&quot;urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/&quot;&gt;&lt;item id=&quot;10fe2064%2fstations%2fSONOS_FAVORITES&quot; parentID=&quot;00080004%2fstations%2fSONOS_FAVORITES&quot; restricted=&quot;true&quot;&gt;&lt;dc:title&gt;&lt;/dc:title&gt;&lt;upnp:class&gt;object.container&lt;/upnp:class&gt;&lt;desc id=&quot;cdudn&quot; nameSpace=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot;&gt;SA_RINCON77575_X_#Svc77575-0-Token&lt;/desc&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;</r:resMD></item><item id="FV:2/2" parentID="FV:2" restricted="false"><dc:title>Sample Song</dc:title><upnp:class>object.itemobject.item.sonos-favorite</upnp:class><r:ordinal>2</r:ordinal><res protocolInfo="sonos.com-spotify:*:audio/x-spotify:*">x-sonos-spotify:spotify%3atrack%3a0SampleTrackId00000001?sid=12&amp;flags=8224&amp;sn=3</res><upnp:albumArtURI>https://img.example/song.jpg</upnp:albumArtURI><r:type>instantPlay</r:type><r:description>By Sample Band</r:description><r:resMD>&lt;DIDL-Lite xmlns:dc=&quot;http://purl.org/dc/elements/1.1/&quot; xmlns:upnp=&quot;urn:schemas-upnp-org:metadata-1-0/upnp/&quot; xmlns:r=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot; xmlns=&quot;urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/&quot;&gt;&lt;item id=&quot;10032020spotify%3atrack%3a0SampleTrackId00000001&quot; parentID=&quot;100e206cspotify%3aartistTopTracks%3a0SampleArtistId0000001&quot; restricted=&quot;true&quot;&gt;&lt;dc:title&gt;Sample Song&lt;/dc:title&gt;&lt;upnp:class&gt;object.item.audioItem.musicTrack&lt;/upnp:class&gt;&lt;desc id=&quot;cdudn&quot; nameSpace=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot;&gt;SA_RINCON3079_X_#Svc3079-0-Token&lt;/desc&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;</r:resMD></item><item id="FV:2/3" parentID="FV:2" restricted="false"><dc:title>Sample Artist</dc:title><upnp:class>object.itemobject.item.sonos-favorite</upnp:class><r:ordinal>3</r:ordinal><res></res><upnp:albumArtURI>https://img.example/artist.jpg</upnp:albumArtURI><r:type>shortcut</r:type><r:description>Artist</r:description><r:resMD>&lt;DIDL-Lite xmlns:dc=&quot;http://purl.org/dc/elements/1.1/&quot; xmlns:upnp=&quot;urn:schemas-upnp-org:metadata-1-0/upnp/&quot; xmlns:r=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot; xmlns=&quot;urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/&quot;&gt;&lt;item id=&quot;10052064artist%3a1000000001&quot; parentID=&quot;10052064artist%3a1000000001&quot; restricted=&quot;true&quot;&gt;&lt;dc:title&gt;Sample Artist&lt;/dc:title&gt;&lt;upnp:class&gt;object.container.person.musicArtist&lt;/upnp:class&gt;&lt;desc id=&quot;cdudn&quot; nameSpace=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot;&gt;SA_RINCON52231_X_#Svc52231-0-Token&lt;/desc&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;</r:resMD></item><item id="FV:2/0" parentID="FV:2" restricted="false"><dc:title>Trending Now</dc:title><upnp:class>object.itemobject.item.sonos-favorite</upnp:class><r:ordinal>4</r:ordinal><res></res><r:type>shortcut</r:type><r:description>From Sonos Radio</r:description><r:resMD>&lt;DIDL-Lite xmlns:dc=&quot;http://purl.org/dc/elements/1.1/&quot; xmlns:upnp=&quot;urn:schemas-upnp-org:metadata-1-0/upnp/&quot; xmlns:r=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot; xmlns=&quot;urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/&quot;&gt;&lt;item id=&quot;10fe0044%2fstations%2fen-US%2fUS%2fc2Q6VVM6dHJlbmRpbmctbm93&quot; parentID=&quot;00080004%2fstations%2fen-US%2fUS%2fc2Q6VVM6dHJlbmRpbmctbm93&quot; restricted=&quot;true&quot;&gt;&lt;dc:title&gt;&lt;/dc:title&gt;&lt;upnp:class&gt;object.container&lt;/upnp:class&gt;&lt;desc id=&quot;cdudn&quot; nameSpace=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot;&gt;SA_RINCON77575_X_#Svc77575-0-Token&lt;/desc&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;</r:resMD></item><item id="FV:2/9" parentID="FV:2" restricted="false"><dc:title>Sample FM 101.1</dc:title><upnp:class>object.itemobject.item.sonos-favorite</upnp:class><r:ordinal>5</r:ordinal><res protocolInfo="x-sonosapi-stream:*:*:*">x-sonosapi-stream:s00001?sid=254&amp;flags=8224&amp;sn=0</res><r:type>instantPlay</r:type><r:description>TuneIn</r:description><r:resMD>&lt;DIDL-Lite xmlns:dc=&quot;http://purl.org/dc/elements/1.1/&quot; xmlns:upnp=&quot;urn:schemas-upnp-org:metadata-1-0/upnp/&quot; xmlns:r=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot; xmlns=&quot;urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/&quot;&gt;&lt;item id=&quot;F00092020s00001&quot; parentID=&quot;L&quot; restricted=&quot;true&quot;&gt;&lt;dc:title&gt;Sample FM 101.1&lt;/dc:title&gt;&lt;upnp:class&gt;object.item.audioItem.audioBroadcast&lt;/upnp:class&gt;&lt;desc id=&quot;cdudn&quot; nameSpace=&quot;urn:schemas-rinconnetworks-com:metadata-1-0/&quot;&gt;SA_RINCON65031_&lt;/desc&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;</r:resMD></item></DIDL-Lite>'


class FakeGroup:
    def __init__(self, coordinator, members):
        self.coordinator, self.members, self._volume, self.log = coordinator, members, 20, coordinator.log
    @property
    def volume(self): return self._volume
    @volume.setter
    def volume(self, v): self.log.append(('group.volume', v)); self._volume = v
    def set_relative_volume(self, d):
        self.log.append(('group.relative', d)); self._volume = max(0, min(100, self._volume + d)); return self._volume


class FakeAV:
    def __init__(self, log, fail=False): self.log, self.fail = log, fail
    def AddURIToQueue(self, args):
        self.log.append(('AddURIToQueue', dict(args)))
        if self.fail: raise SoCoUPnPException('UPnP Error 800', 800, '')
        return {'FirstTrackNumberEnqueued': '7'}


class FakeSpeaker:
    """Enough of soco.SoCo for frame_api. Every write is appended to `log`; nothing else changes."""
    def __init__(self, name, log, soundbar=False, tv=False, portable=False):
        self.player_name, self.uid, self.log = name, 'RINCON_' + name.upper().replace(' ', ''), log
        self.is_visible, self.is_soundbar, self.is_playing_tv, self.portable = True, soundbar, tv, portable
        self._volume, self.mute, self._cross_fade = 30, False, False
        self.available_actions = ['Set', 'Stop', 'Pause', 'Play', 'Next', 'Previous', 'SeekTime']
        self.avTransport = FakeAV(log)
        self.group = FakeGroup(self, [self])
        self._eq = {'bass': 2, 'treble': 1, 'loudness': True}
        if soundbar:
            self._eq.update(night_mode=False, dialog_mode=True, sub_gain=8, surround_level=7)
        self.music_library = self
    # EQ: soco answers None for what a speaker lacks
    def __getattr__(self, k):
        if k in ('bass', 'treble', 'loudness', 'night_mode', 'dialog_mode', 'sub_gain', 'surround_level'):
            return self.__dict__['_eq'].get(k)
        raise AttributeError(k)
    def __setattr__(self, k, v):
        if k in ('bass', 'treble', 'loudness', 'night_mode', 'dialog_mode', 'sub_gain', 'surround_level'):
            self.log.append((k, v)); self._eq[k] = v; return
        object.__setattr__(self, k, v)
    @property
    def volume(self): return self._volume
    @volume.setter
    def volume(self, v): self.log.append(('volume', self.player_name, v)); self._volume = v
    @property
    def cross_fade(self): return self._cross_fade
    @cross_fade.setter
    def cross_fade(self, v): self.log.append(('cross_fade', v)); self._cross_fade = v
    def set_play_mode(self, v): self.log.append(('play_mode', v))
    def join(self, master): self.log.append(('join', self.player_name, master.player_name))
    def unjoin(self): self.log.append(('unjoin', self.player_name))
    def seek(self, t): self.log.append(('seek', t))
    def play_uri(self, uri, meta='', title=''): self.log.append(('play_uri', uri, title))
    def add_to_queue(self, item): self.log.append(('add_to_queue', item.resources[0].uri)); return 4
    def play_from_queue(self, i): self.log.append(('play_from_queue', i))
    def remove_from_queue(self, i): self.log.append(('remove_from_queue', i))
    def clear_queue(self): self.log.append(('clear_queue',))
    def set_sleep_timer(self, s): self.log.append(('sleep', s))
    def get_sleep_timer(self): return 1500
    def get_sonos_favorites(self, max_items=100): return from_didl_string(FAVORITES_DIDL)
    def get_current_transport_info(self): return {'current_transport_state': 'PLAYING'}
    def get_current_track_info(self):
        return {'title': 'Harvest Moon', 'artist': 'Neil Young', 'album': 'Harvest Moon', 'album_art': 'http://x/getaa',
                'position': '0:01:05', 'duration': '0:05:03', 'playlist_position': '3', 'uri': 'x-sonos-spotify:spotify%3atrack%3aabc?sid=12'}
    def get_current_media_info(self): return {'uri': 'x-rincon-queue:' + self.uid + '#0'}
    def get_battery_info(self, timeout=3):
        if not self.portable:
            raise Exception('NotSupported')
        return {'Level': 80, 'PowerSource': 'BATTERY', 'Health': 'GREEN'}
    def get_queue(self, start, count, full_album_art_uri=False):
        class Q(list): total_matches = 50
        class T:
            def __init__(s, i): s.title, s.creator, s.album, s.album_art_uri = 'Song %d' % i, 'Artist', 'Album', 'http://x/aa%d' % i
        return Q(T(start + i) for i in range(count))


def _play_mode_property():
    # play_mode needs a setter that records; define on the class so __setattr__ does not shadow it
    def get(self): return self.__dict__.get('_pm', 'NORMAL')
    def put(self, v): self.log.append(('play_mode', v)); self.__dict__['_pm'] = v
    return property(get, put)
FakeSpeaker.play_mode = _play_mode_property()


class House:
    """Three sample rooms: Den (Arc soundbar), Patio (Move, portable), Kitchen."""
    def __init__(self, arc_on_tv=False):
        self.log = []
        self.den = FakeSpeaker('Den', self.log, soundbar=True, tv=arc_on_tv)
        self.patio = FakeSpeaker('Patio', self.log, portable=True)
        self.kitchen = FakeSpeaker('Kitchen', self.log)
        self.by_id = {'den': self.den, 'pat': self.patio, 'kit': self.kitchen}
        self.zones = {k: {'name': v.player_name, 'model': 'Sonos Move' if k == 'pat' else 'Sonos Arc' if k == 'den' else 'Sonos One SL', 'ip': '10.20.30.40', 'uid': v.uid}
                      for k, v in self.by_id.items()}
    def group(self, coordinator, *members):
        g = FakeGroup(coordinator, [coordinator] + list(members))
        for s in g.members:
            s.group = g
    def run(self, payload):
        with patch.object(F, 'speaker', side_effect=lambda k: self.by_id[k] if k in self.by_id else (_ for _ in ()).throw(ValueError('Unknown Sonos room'))), \
             patch.object(F, 'zone_map', return_value=self.zones), patch.object(F, '_zone_key', side_effect=lambda uid: {v.uid: k for k, v in self.by_id.items()}.get(uid, 'x')), \
             patch.object(F, '_caps', {}), patch.object(F, '_cache', {}):
            return F.music_command(payload)
    def doc(self, fn, *a):
        with patch.object(F, 'speaker', side_effect=lambda k: self.by_id[k]), patch.object(F, 'zone_map', return_value=self.zones), \
             patch.object(F, '_zone_key', side_effect=lambda uid: {v.uid: k for k, v in self.by_id.items()}.get(uid, 'x')), \
             patch.object(F, '_caps', {}), patch.object(F, '_cache', {}):
            return fn(*a)


def fav_id(title):
    return next(f.item_id for f in from_didl_string(FAVORITES_DIDL) if f.title == title)


class FavoriteTests(unittest.TestCase):
    """Bug 1: 4 of 5 real favorites have no resource; resources[0] raised IndexError -> 503."""
    def test_fixture_matches_the_bug(self):
        empty = [f.title for f in from_didl_string(FAVORITES_DIDL) if not f.resources]
        self.assertEqual(sorted(empty), ['Discover Sonos Radio', 'Favorites', 'Sample Artist', 'Trending Now'])

    def test_old_code_path_raised_index_error(self):
        fav = next(f for f in from_didl_string(FAVORITES_DIDL) if f.title == 'Trending Now')
        with self.assertRaises(IndexError):
            fav.reference.resources[0].uri

    def test_sonos_radio_shortcut_queues_as_cloud_container(self):
        h = House()
        r = h.run({'room': 'den', 'action': 'favorite', 'favorite': fav_id('Trending Now')})
        self.assertEqual(r['how'], 'container')
        add = [e for e in h.log if e[0] == 'AddURIToQueue'][0][1]
        self.assertTrue(add['EnqueuedURI'].startswith('x-rincon-cpcontainer:10fe0044%2fstations%2f'))
        self.assertIn('SA_RINCON77575_X_#Svc77575-0-Token', add['EnqueuedURIMetaData'])
        self.assertEqual(h.log[-1], ('play_from_queue', 6))       # FirstTrackNumberEnqueued 7 is 1-based

    def test_every_sonos_radio_shortcut_plays(self):
        for title in ('Discover Sonos Radio', 'Favorites', 'Trending Now'):
            with self.subTest(title=title):
                h = House()
                self.assertEqual(h.run({'room': 'den', 'action': 'favorite', 'favorite': fav_id(title)})['how'], 'container')

    def test_apple_music_artist_shortcut_queues_as_cloud_container(self):
        h = House()
        h.run({'room': 'pat', 'action': 'favorite', 'favorite': fav_id('Sample Artist')})
        add = [e for e in h.log if e[0] == 'AddURIToQueue'][0][1]
        self.assertEqual(add['EnqueuedURI'], 'x-rincon-cpcontainer:10052064artist%3a1000000001')
        self.assertIn('object.container.person.musicArtist', add['EnqueuedURIMetaData'])
        self.assertIn('SA_RINCON52231_', add['EnqueuedURIMetaData'])

    def test_spotify_track_favorite_still_queues_its_resource(self):
        h = House()
        r = h.run({'room': 'den', 'action': 'favorite', 'favorite': fav_id('Sample Song')})
        self.assertEqual(r['how'], 'queue')
        self.assertTrue(h.log[0][1].startswith('x-sonos-spotify:spotify%3atrack%3a0SampleTrackId00000001'))
        self.assertEqual(h.log[1], ('play_from_queue', 3))

    def test_radio_stream_favorite_uses_play_uri(self):
        h = House()
        self.assertEqual(h.run({'room': 'den', 'action': 'favorite', 'favorite': fav_id('Sample FM 101.1')})['how'], 'radio')
        self.assertEqual(h.log, [('play_uri', 'x-sonosapi-stream:s00001?sid=254&flags=8224&sn=0', 'Sample FM 101.1')])

    def test_speaker_refusal_is_a_readable_400_not_a_503(self):
        h = House(); h.den.avTransport = FakeAV(h.log, fail=True)
        with self.assertRaises(ValueError):
            h.run({'room': 'den', 'action': 'favorite', 'favorite': fav_id('Trending Now')})
        self.assertNotIn(('play_from_queue', 6), h.log)

    def test_unknown_favorite(self):
        with self.assertRaises(ValueError):
            House().run({'room': 'den', 'action': 'favorite', 'favorite': 'FV:2/99'})

    def test_favorites_doc_has_art_and_kind(self):
        h = House()
        d = h.doc(F.favorites_doc, 'den')
        sc = next(f for f in d['favorites'] if f['title'] == 'Sample Artist')
        self.assertTrue(sc['art'].startswith('https://img.example/'))
        self.assertEqual(sc['kind'], 'Artist')


class VolumeTests(unittest.TestCase):
    """Bug 2: volume acted on one speaker, not the group."""
    def test_volume_sets_group_not_one_speaker(self):
        h = House(); h.group(h.den, h.patio)
        h.run({'room': 'pat', 'action': 'volume', 'value': 40})
        self.assertEqual(h.log, [('group.volume', 40)])
        self.assertEqual(h.den.group.volume, 40)

    def test_volume_step_is_relative_on_the_group(self):
        h = House(); h.group(h.den, h.patio)
        self.assertEqual(h.run({'room': 'den', 'action': 'volume_step', 'delta': -5})['volume'], 15)
        self.assertEqual(h.log, [('group.relative', -5)])

    def test_room_volume_sets_only_that_room(self):
        h = House(); h.group(h.den, h.patio)
        h.run({'room': 'pat', 'action': 'room_volume', 'value': 12})
        self.assertEqual(h.log, [('volume', 'Patio', 12)])

    def test_bad_volume_never_sent(self):
        for p in ({'action': 'volume', 'value': 101}, {'action': 'volume', 'value': True}, {'action': 'room_volume', 'value': '5'},
                  {'action': 'volume_step', 'delta': 50}):
            with self.subTest(p=p):
                h = House(); p['room'] = 'den'
                with self.assertRaises(ValueError): h.run(p)
                self.assertEqual(h.log, [])


class TransportTests(unittest.TestCase):
    def test_seek_formats_position(self):
        h = House(); h.run({'room': 'den', 'action': 'seek', 'position': 3725})
        self.assertEqual(h.log, [('seek', '1:02:05')])

    def test_seek_refused_when_source_cannot_seek(self):
        h = House(); h.den.available_actions = ['Set', 'Play']
        with self.assertRaises(ValueError): h.run({'room': 'den', 'action': 'seek', 'position': 10})
        self.assertEqual(h.log, [])

    def test_seek_on_member_goes_to_coordinator(self):
        h = House(); h.group(h.den, h.patio)
        h.run({'room': 'pat', 'action': 'seek', 'position': 5})
        self.assertEqual(h.log, [('seek', '0:00:05')])

    def test_shuffle_keeps_repeat(self):
        h = House(); h.den.play_mode = 'REPEAT_ALL'; h.log.clear()
        h.run({'room': 'den', 'action': 'play_mode', 'shuffle': True})
        self.assertEqual(h.log, [('play_mode', 'SHUFFLE')])

    def test_repeat_one_keeps_shuffle(self):
        h = House(); h.den.play_mode = 'SHUFFLE_NOREPEAT'; h.log.clear()
        h.run({'room': 'den', 'action': 'play_mode', 'repeat': 'one'})
        self.assertEqual(h.log, [('play_mode', 'SHUFFLE_REPEAT_ONE')])

    def test_bad_play_mode(self):
        for p in ({'shuffle': 'yes'}, {'repeat': 'twice'}, {}):
            with self.subTest(p=p):
                h = House(); p.update(room='den', action='play_mode')
                with self.assertRaises(ValueError): h.run(p)
                self.assertEqual(h.log, [])

    def test_crossfade(self):
        h = House(); h.run({'room': 'den', 'action': 'crossfade', 'on': True})
        self.assertEqual(h.log, [('cross_fade', True)])
        with self.assertRaises(ValueError): h.run({'room': 'den', 'action': 'crossfade', 'on': 1})


class GroupTests(unittest.TestCase):
    def test_join_two_rooms_to_the_den(self):
        h = House()
        r = h.run({'room': 'den', 'action': 'group', 'members': ['pat', 'kit']})
        self.assertEqual(h.log, [('join', 'Kitchen', 'Den'), ('join', 'Patio', 'Den')])
        self.assertEqual(r['joined'], ['kit', 'pat'])

    def test_remove_one_room_from_group(self):
        h = House(); h.group(h.den, h.patio, h.kitchen)
        h.run({'room': 'den', 'action': 'group', 'members': ['kit']})
        self.assertEqual(h.log, [('unjoin', 'Patio')])

    def test_member_regroups_without_old_coordinator(self):
        # Patio is in the Den's group; from Patio, keep Kitchen but drop Den.
        h = House(); h.group(h.den, h.patio)
        h.run({'room': 'pat', 'action': 'group', 'members': ['kit']})
        self.assertEqual(h.log, [('unjoin', 'Patio'), ('unjoin', 'Den'), ('join', 'Kitchen', 'Patio')])

    def test_arc_on_tv_is_never_pulled_into_a_group(self):
        h = House(arc_on_tv=True)
        with self.assertRaises(ValueError) as e:
            h.run({'room': 'pat', 'action': 'group', 'members': ['kit', 'den']})
        self.assertIn('TV sound', str(e.exception))
        self.assertEqual(h.log, [])                       # refused before ANY write, including Dining Room's join

    def test_arc_on_tv_may_host_a_group(self):
        h = House(arc_on_tv=True)
        h.run({'room': 'den', 'action': 'group', 'members': ['pat']})
        self.assertEqual(h.log, [('join', 'Patio', 'Den')])

    def test_arc_off_tv_can_join(self):
        h = House()
        h.run({'room': 'pat', 'action': 'group', 'members': ['den']})
        self.assertEqual(h.log, [('join', 'Den', 'Patio')])

    def test_unknown_or_bad_members(self):
        for m in (['nope'], 'pat', [1], ['pat'] * 21):
            with self.subTest(m=m):
                h = House()
                with self.assertRaises(ValueError): h.run({'room': 'den', 'action': 'group', 'members': m})
                self.assertEqual(h.log, [])

    def test_ungroup(self):
        h = House(); h.group(h.den, h.patio)
        h.run({'room': 'pat', 'action': 'ungroup'})
        self.assertEqual(h.log, [('unjoin', 'Patio')])


class QueueTests(unittest.TestCase):
    def test_play_remove_clear_go_to_coordinator(self):
        h = House(); h.group(h.den, h.patio)
        h.run({'room': 'pat', 'action': 'queue_play', 'index': 4})
        h.run({'room': 'pat', 'action': 'queue_remove', 'index': 2})
        h.run({'room': 'pat', 'action': 'queue_clear'})
        self.assertEqual(h.log, [('play_from_queue', 4), ('remove_from_queue', 2), ('clear_queue',)])

    def test_bad_index(self):
        for i in (-1, '2', None, 2.0, 10000):
            with self.subTest(i=i):
                h = House()
                with self.assertRaises(ValueError): h.run({'room': 'den', 'action': 'queue_play', 'index': i})
                self.assertEqual(h.log, [])

    def test_queue_doc_pages_with_art_and_current(self):
        d = House().doc(F.queue_doc, 'den', 20)
        self.assertEqual(len(d['items']), 20); self.assertEqual(d['items'][0]['index'], 20)
        self.assertEqual(d['items'][0]['art'], 'http://x/aa20'); self.assertEqual(d['total'], 50)
        self.assertEqual(d['current'], 2); self.assertTrue(d['active'])


class SleepAndEqTests(unittest.TestCase):
    def test_sleep_set_and_cancel(self):
        h = House()
        h.run({'room': 'den', 'action': 'sleep', 'minutes': 30})
        h.run({'room': 'den', 'action': 'sleep', 'minutes': None})
        self.assertEqual(h.log, [('sleep', 1800), ('sleep', None)])
        for bad in (0, 721, '30', True):
            with self.assertRaises(ValueError): h.run({'room': 'den', 'action': 'sleep', 'minutes': bad})

    def test_bass_treble_loudness_everywhere(self):
        h = House()
        h.run({'room': 'pat', 'action': 'eq', 'setting': 'bass', 'value': -3})
        h.run({'room': 'kit', 'action': 'eq', 'setting': 'treble', 'value': 10})
        h.run({'room': 'pat', 'action': 'eq', 'setting': 'loudness', 'value': False})
        self.assertEqual(h.log, [('bass', -3), ('treble', 10), ('loudness', False)])

    def test_eq_set_on_the_room_not_the_coordinator(self):
        h = House(); h.group(h.den, h.patio)
        h.run({'room': 'pat', 'action': 'eq', 'setting': 'bass', 'value': 1})
        self.assertEqual(h.patio._eq['bass'], 1); self.assertEqual(h.den._eq['bass'], 2)

    def test_soundbar_settings_on_the_arc(self):
        h = House()
        for setting, value in (('night', True), ('speech', False), ('sub_gain', -4), ('surround_level', 3)):
            h.run({'room': 'den', 'action': 'eq', 'setting': setting, 'value': value})
        self.assertEqual(h.log, [('night_mode', True), ('dialog_mode', False), ('sub_gain', -4), ('surround_level', 3)])

    def test_soundbar_settings_refused_where_unsupported(self):
        for setting, value in (('night', True), ('speech', True), ('sub_gain', 1), ('surround_level', 1)):
            with self.subTest(setting=setting):
                h = House()
                with self.assertRaises(ValueError) as e: h.run({'room': 'pat', 'action': 'eq', 'setting': setting, 'value': value})
                self.assertIn('does not have', str(e.exception)); self.assertEqual(h.log, [])

    def test_eq_ranges(self):
        for setting, value in (('bass', 11), ('treble', -11), ('sub_gain', 16), ('loudness', 1), ('volume', 3)):
            with self.subTest(setting=setting):
                h = House()
                with self.assertRaises(ValueError): h.run({'room': 'den', 'action': 'eq', 'setting': setting, 'value': value})
                self.assertEqual(h.log, [])

    def test_settings_doc_reads_capabilities(self):
        h = House()
        arc, move = h.doc(F.settings_doc, 'den'), h.doc(F.settings_doc, 'pat')
        self.assertEqual(arc['values'], {'bass': 2, 'treble': 1, 'loudness': True, 'night': False, 'speech': True, 'sub_gain': 8, 'surround_level': 7})
        self.assertEqual(move['values'], {'bass': 2, 'treble': 1, 'loudness': True})
        self.assertFalse(move['caps']['night']); self.assertTrue(arc['caps']['sub'])
        self.assertEqual(move['battery'], {'level': 80, 'charging': False, 'health': 'GREEN'}); self.assertIsNone(arc['battery'])
        self.assertEqual(arc['sleep'], 1500)


class DocTests(unittest.TestCase):
    def test_music_doc_new_fields_and_old_ones_kept(self):
        h = House(); h.group(h.den, h.patio)
        d = h.doc(F.music_doc)
        bas = next(r for r in d['rooms'] if r['id'] == 'pat')
        for k in ('id', 'name', 'ok', 'state', 'title', 'artist', 'album', 'volume', 'muted', 'art', 'source', 'group', 'actions'):
            self.assertIn(k, bas)
        self.assertEqual((bas['position'], bas['duration'], bas['track_no']), (65, 303, 3))
        self.assertEqual(bas['group'], ['Den', 'Patio']); self.assertEqual(bas['group_ids'], ['den', 'pat'])
        self.assertEqual(bas['coordinator'], 'den'); self.assertEqual(bas['group_volume'], 20); self.assertEqual(bas['volume'], 30)
        self.assertEqual(bas['battery']['level'], 80); self.assertTrue(bas['queue']); self.assertEqual(bas['source'], 'Spotify')
        self.assertEqual((bas['shuffle'], bas['repeat']), (False, 'off')); self.assertEqual(bas['sleep'], 1500)
        liv = next(r for r in d['rooms'] if r['id'] == 'den')
        self.assertTrue(liv['caps']['night']); self.assertIsNone(liv['battery']); self.assertFalse(bas['caps']['night'])

    def test_source_labels(self):
        self.assertEqual(F._source('x-sonos-vli:RINCON_1:1,spotify:abc'), 'Spotify Connect')
        self.assertEqual(F._source('x-sonos-spotify:spotify%3atrack%3a1?sid=12'), 'Spotify')
        self.assertEqual(F._source('x-sonos-htastream:RINCON_1:spdif'), 'TV audio')
        self.assertEqual(F._source('x-sonosapi-hls:x?sid=303&flags=1'), 'Sonos Radio')
        self.assertEqual(F._source(''), 'Sonos')

    def test_kind(self):
        self.assertEqual(F._kind('x-sonos-spotify:spotify%3aepisode%3a5Xt5DXGzch68nYYamXrNxZ?sid=12&flags=8232&sn=3', 'Spotify', 3600), 'podcast')
        self.assertEqual(F._kind('x-sonos-spotify:spotify%3atrack%3aabc?sid=12', 'Spotify', 200), 'track')
        self.assertEqual(F._kind('x-sonosapi-stream:s00001?sid=254', 'Sonos', None), 'radio')
        self.assertEqual(F._kind('x-sonos-htastream:RINCON_1:spdif', 'TV audio', None), 'tv')
        self.assertEqual(House().doc(F.music_doc)['rooms'][0]['kind'], 'track')

    def test_secs(self):
        self.assertEqual(F._secs('1:02:03'), 3723); self.assertIsNone(F._secs('NOT_IMPLEMENTED')); self.assertIsNone(F._secs(None))


class SpotifyLinkTests(unittest.TestCase):
    def _run(self, link):
        import types
        from unittest.mock import Mock
        plugin = Mock(); plugin.add_share_link_to_queue.return_value = 2
        module = types.ModuleType('soco.plugins.sharelink'); module.ShareLinkPlugin = Mock(return_value=plugin)
        h = House()
        with patch.dict('sys.modules', {'soco.plugins.sharelink': module}):
            h.run({'room': 'den', 'action': 'spotify', 'link': link})
        return plugin.add_share_link_to_queue.call_args[0][0], h.log

    def test_episode_show_and_uris_accepted(self):
        for link, sent in (('https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ?si=x', 'https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ'),
                           ('https://open.spotify.com/intl-fr/show/2MAi0BvDc6GTFvKFPXnkCL', 'https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL'),
                           ('spotify:album:6wiUBliPe76YAVpNEdidpY', 'spotify:album:6wiUBliPe76YAVpNEdidpY'),
                           ('spotify:episode:5Xt5DXGzch68nYYamXrNxZ', 'spotify:episode:5Xt5DXGzch68nYYamXrNxZ'),
                           ('spotify:track:0SampleTrackId00000001', 'spotify:track:0SampleTrackId00000001')):
            with self.subTest(link=link):
                got, log = self._run(link)
                self.assertEqual(got, sent); self.assertEqual(log[-1], ('play_from_queue', 1))

    def test_soco_share_plugin_understands_every_allowed_type(self):
        # what the frame lets through, soco's real SpotifyShare must be able to queue
        from soco.plugins.sharelink import SpotifyShare
        for kind in ('track', 'album', 'playlist', 'episode', 'show'):
            self.assertEqual(SpotifyShare().canonical_uri('https://open.spotify.com/%s/abc123' % kind), 'spotify:%s:abc123' % kind)

    def test_artist_and_junk_refused(self):
        for link in ('https://open.spotify.com/artist/abc', 'spotify:artist:abc', 'spotify:user:me', 'https://open.spotify.com/episode/a b'):
            with self.subTest(link=link):
                h = House()
                with self.assertRaises(ValueError): h.run({'room': 'den', 'action': 'spotify', 'link': link})
                self.assertEqual(h.log, [])


if __name__ == '__main__':
    unittest.main()


class ShuffleTests(unittest.TestCase):
    """With shuffle on, Sonos reads a queue position in the SHUFFLED order, so 'play item 51' played a random
    queued song (a Spotify pick once played an unrelated track). Picking something must turn shuffle off
    first, keeping repeat, then play the real position."""
    def _order(self, log):
        return [e for e in log if e[0] in ('play_mode', 'play_from_queue')]

    def test_spotify_pick_with_shuffle_on(self):
        import types
        from unittest.mock import Mock
        plugin = Mock(); plugin.add_share_link_to_queue.return_value = 51
        module = types.ModuleType('soco.plugins.sharelink'); module.ShareLinkPlugin = Mock(return_value=plugin)
        h = House(); h.den.play_mode = 'SHUFFLE'; h.log.clear()      # shuffle + repeat all
        with patch.dict('sys.modules', {'soco.plugins.sharelink': module}):
            h.run({'room': 'den', 'action': 'spotify', 'link': 'spotify:album:6wiUBliPe76YAVpNEdidpY'})
        self.assertEqual(self._order(h.log), [('play_mode', 'REPEAT_ALL'), ('play_from_queue', 50)])

    def test_queue_tap_with_shuffle_on(self):
        h = House(); h.den.play_mode = 'SHUFFLE_NOREPEAT'; h.log.clear()
        h.run({'room': 'den', 'action': 'queue_play', 'index': 4})
        self.assertEqual(self._order(h.log), [('play_mode', 'NORMAL'), ('play_from_queue', 4)])

    def test_favorite_with_shuffle_on(self):
        h = House(); h.den.play_mode = 'SHUFFLE_REPEAT_ONE'; h.log.clear()
        h.run({'room': 'den', 'action': 'favorite', 'favorite': fav_id('Sample Song')})
        self.assertEqual(self._order(h.log), [('play_mode', 'REPEAT_ONE'), ('play_from_queue', 3)])

    def test_no_mode_change_when_shuffle_is_off(self):
        h = House(); h.den.play_mode = 'REPEAT_ALL'; h.log.clear()
        h.run({'room': 'den', 'action': 'queue_play', 'index': 2})
        self.assertEqual(self._order(h.log), [('play_from_queue', 2)])


class SpotifyQueueAndTvTests(unittest.TestCase):
    """2026-10-13: Spotify picks piled onto the end of the Sonos queue, and nothing stopped a pick from
    cutting the Den TV's sound. Albums/playlists/shows now replace the queue; a song or episode goes
    in as the next track. A soundbar on TV refuses unless the frame says over_tv (the person confirmed)."""
    def _run(self, link, h=None, **extra):
        import types
        from unittest.mock import Mock
        plugin = Mock(); plugin.add_share_link_to_queue.return_value = 1
        module = types.ModuleType('soco.plugins.sharelink'); module.ShareLinkPlugin = Mock(return_value=plugin)
        h = h or House()
        with patch.dict('sys.modules', {'soco.plugins.sharelink': module}):
            h.run(dict({'room': 'den', 'action': 'spotify', 'link': link}, **extra))
        return plugin.add_share_link_to_queue.call_args, h.log

    def test_album_and_playlist_replace_the_queue(self):
        for link in ('spotify:album:6wiUBliPe76YAVpNEdidpY', 'spotify:playlist:6fUFTYCX6PT9mRQ6dMqJA0', 'https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL'):
            with self.subTest(link=link):
                call, log = self._run(link)
                self.assertEqual(log, [('clear_queue',), ('play_from_queue', 0)])
                self.assertFalse(call.kwargs.get('as_next'))

    def test_song_goes_in_next_and_keeps_the_queue(self):
        call, log = self._run('spotify:track:0SampleTrackId00000001')
        self.assertTrue(call.kwargs.get('as_next'))
        self.assertNotIn(('clear_queue',), log)
        self.assertEqual(log, [('play_from_queue', 0)])

    def test_tv_soundbar_refuses_spotify_and_favorites(self):
        h = House(arc_on_tv=True)
        with self.assertRaisesRegex(ValueError, 'playing the TV'):
            self._run('spotify:album:6wiUBliPe76YAVpNEdidpY', h)
        with self.assertRaisesRegex(ValueError, 'playing the TV'):
            h.run({'room': 'den', 'action': 'favorite', 'favorite': fav_id('Sample Song')})
        self.assertEqual(h.log, [])

    def test_tv_soundbar_plays_when_confirmed(self):
        call, log = self._run('spotify:album:6wiUBliPe76YAVpNEdidpY', House(arc_on_tv=True), over_tv=True)
        self.assertEqual(log[-1], ('play_from_queue', 0))

    def test_room_grouped_under_tv_soundbar_refuses(self):
        h = House(arc_on_tv=True); h.group(h.den, h.kitchen)
        with self.assertRaisesRegex(ValueError, 'playing the TV'):
            self._run('spotify:track:0SampleTrackId00000001', h)
