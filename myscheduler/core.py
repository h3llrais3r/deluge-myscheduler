#
# core.py
#
# Copyright (C) 2009 Andrew Resch <andrewresch@gmail.com>
#
# Basic plugin template created by:
# Copyright (C) 2008 Martijn Voncken <mvoncken@gmail.com>
# Copyright (C) 2007-2009 Andrew Resch <andrewresch@gmail.com>
#
# Deluge is free software.
#
# You may redistribute it and/or modify it under the terms of the
# GNU General Public License, as published by the Free Software
# Foundation; either version 3 of the License, or (at your option)
# any later version.
#
# deluge is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
# See the GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with deluge.    If not, write to:
# 	The Free Software Foundation, Inc.,
# 	51 Franklin Street, Fifth Floor
# 	Boston, MA  02110-1301, USA.
#
#    In addition, as a special exception, the copyright holders give
#    permission to link the code of portions of this program with the OpenSSL
#    library.
#    You must obey the GNU General Public License in all respects for all of
#    the code used other than OpenSSL. If you modify file(s) with this
#    exception, you may extend this exception to your version of the file(s),
#    but you are not obligated to do so. If you do not wish to do so, delete
#    this exception statement from your version. If you delete this exception
#    statement from all source files in the program, then also delete it here.
#

import time

from deluge.log import LOG as log
from deluge.plugins.pluginbase import CorePluginBase
import deluge.component as component
import deluge.configmanager
from deluge.core.rpcserver import export
from deluge.event import DelugeEvent, SessionResumedEvent

from twisted.internet import reactor

DEFAULT_PREFS = {
    "low_down": -1.0,
    "low_up": -1.0,
    "low_active": -1,
    "low_active_down": -1,
    "low_active_up": -1,
    "button_state": [[0] * 7 for dummy in xrange(24)],
    "force_use_individual" : True,
    "force_unforce_finished" : True
}

DEFAULT_STATES = {}

STATES = {
    0: "Green",
    1: "Yellow",
    2: "Red"
}

CONTROLLED_SETTINGS = [
    "max_download_speed",
    "max_upload_speed",
    "max_active_limit",
    "max_active_downloading",
    "max_active_seeding"
]

class SchedulerEvent(DelugeEvent):
    """
    Emitted when a schedule state changes.
    """
    def __init__(self, colour):
        """
        :param colour: str, the current scheduler state
        """
        self._args = [colour]

class Core(CorePluginBase):
    def enable(self):
        # Create the defaults with the core config
        core_config = component.get("Core").config
        DEFAULT_PREFS["low_down"] = core_config["max_download_speed"]
        DEFAULT_PREFS["low_up"] = core_config["max_upload_speed"]
        DEFAULT_PREFS["low_active"] = core_config["max_active_limit"]
        DEFAULT_PREFS["low_active_down"] = core_config["max_active_downloading"]
        DEFAULT_PREFS["low_active_up"] = core_config["max_active_seeding"]

        self.config = deluge.configmanager.ConfigManager("myscheduler.conf", DEFAULT_PREFS)
        self.torrent_states = deluge.configmanager.ConfigManager("myschedulerstates.conf", DEFAULT_STATES)

        self._cleanup_states()
        self.state = self.get_state()

        # Apply the scheduling rules
        self.do_schedule(False)

        # Schedule the next do_schedule() call for on the next hour
        now = time.localtime(time.time())
        secs_to_next_hour = ((60 - now[4]) * 60) + (60 - now[5])
        log.debug("Next schedule check in %s seconds" % secs_to_next_hour)
        self.timer = reactor.callLater(secs_to_next_hour, self.do_schedule)

        eventmanager = component.get("EventManager")

        eventmanager.register_event_handler("TorrentAddedEvent", self.update_torrent)
        eventmanager.register_event_handler("TorrentResumedEvent", self.update_torrent)
        eventmanager.register_event_handler("TorrentRemovedEvent", self._remove_torrent)
        eventmanager.register_event_handler("TorrentFinishedEvent", self._on_torrent_finished)

        # Register for config changes so state isn't overridden
        eventmanager.register_event_handler("ConfigValueChangedEvent", self.on_config_value_changed)

    def disable(self):
        try:
            self.timer.cancel()
        except:
            pass

        eventmanager = component.get("EventManager")

        eventmanager.deregister_event_handler("TorrentAddedEvent", self.update_torrent)
        eventmanager.deregister_event_handler("TorrentResumedEvent", self.update_torrent)
        eventmanager.deregister_event_handler("TorrentRemovedEvent", self._remove_torrent)
        eventmanager.deregister_event_handler("TorrentFinishedEvent", self._on_torrent_finished)

        eventmanager.deregister_event_handler("ConfigValueChangedEvent", self.on_config_value_changed)

        self.__apply_set_functions()

    def update(self):
        pass


    def on_config_value_changed(self, key, value):
        if key in CONTROLLED_SETTINGS:
            self.do_schedule(False)

    def __apply_set_functions(self):
        """
        Have the core apply it's bandwidth settings as specified in core.conf.
        """
        core_config = deluge.configmanager.ConfigManager("core.conf")
        for setting in CONTROLLED_SETTINGS:
            core_config.apply_set_functions(setting)
        # Resume the session if necessary
        self.resume_all_torrents()

    def do_schedule(self, timer=True):
        """
        This is where we apply schedule rules.
        """
        log.debug("Checking schedule")

        state = self.get_state()
        self.update_torrent()

        if state == "Green":
            # This is Green (Normal) so we just make sure we've applied the
            # global defaults
            self.__apply_set_functions()
        elif state == "Yellow":
            # This is Yellow (Slow), so use the settings provided from the user
            session = component.get("Core").session
            session.set_download_rate_limit(int(self.config["low_down"] * 1024))
            session.set_upload_rate_limit(int(self.config["low_up"] * 1024))
            settings = session.settings()
            settings.active_limit = self.config["low_active"]
            settings.active_downloads = self.config["low_active_down"]
            settings.active_seeds = self.config["low_active_up"]
            session.set_settings(settings)
            # Resume the session if necessary
            self.resume_all_torrents()
        elif state == "Red":
            # This is Red (Stop), so pause the libtorrent session
            self.pause_all_torrents()

        if state != self.state:
            # The state has changed since last update so we need to emit an event
            self.state = state
            component.get("EventManager").emit(SchedulerEvent(self.state))

        # called after self.state is set
        if self.config["force_use_individual"] and (state == 'Green' or state == 'Red'):
            self.update_torrent()

        if timer:
            # Call this again in 1 hour
            log.debug("Next schedule check in 3600 seconds")
            self.timer = reactor.callLater(3600, self.do_schedule)

    @export()
    def set_config(self, config):
        "sets the config dictionary"
        for key in config.keys():
            self.config[key] = config[key]
        self.config.save()
        self.do_schedule(False)

    @export()
    def get_config(self):
        "returns the config dictionary"
        return self.config.config

    @export()
    def get_state(self):
        now = time.localtime(time.time())
        level = self.config["button_state"][now[3]][now[6]]
        return STATES[level]

    @export()
    def get_forced(self, torrent_ids):
        if not hasattr(torrent_ids, '__iter__'):
            torrent_ids = [torrent_ids]

        def f(t_id):
            try:
                return self.torrent_states[t_id]['forced']
            except KeyError:
                return False

        return [ f(t) for t in torrent_ids]

    @export()
    def set_forced(self, torrent_ids, forced=True):
        log.debug("Setting torrent %s to forced=%s" % (torrent_ids, forced))

        if not hasattr(torrent_ids, '__iter__'):
            torrent_ids = [torrent_ids]

        for t in torrent_ids:
            self.torrent_states[t]['forced'] = forced

        self.update_torrent(torrent_ids)

    @export()
    def pause_all_torrents(self):
        """
        Pause all torrents in the session.
        Fix for https://github.com/h3llrais3r/deluge-myscheduler/issues/4
        """
        for torrent in component.get("Core").torrentmanager.torrents.values():
            torrent.pause()

    @export()
    def resume_all_torrents(self):
        """
        Resume all torrents in the session.
        Fix for https://github.com/h3llrais3r/deluge-myscheduler/issues/4
        """
        for torrent in component.get("Core").torrentmanager.torrents.values():
            torrent.resume()
        component.get("EventManager").emit(SessionResumedEvent())

    @export()
    def update_torrent(self, torrent_ids = None):
        if not self.config['force_use_individual']:
            return

        torrentmanager = component.get("Core").torrentmanager

        if torrent_ids is None:
            torrent_ids = torrentmanager.get_torrent_list()
        elif not hasattr(torrent_ids, '__iter__'):
            torrent_ids = [torrent_ids]

        for torrent_id in torrent_ids:
            torrent = torrentmanager.torrents[torrent_id]

            try:
                tstate = self.torrent_states[torrent_id]
            except KeyError:
                tstate = {'forced' : False, 'paused' : False }
                self.torrent_states[torrent_id] = tstate

            if self.state == 'Green' or self.state == 'Yellow':
                if tstate['paused']:
                    torrent.resume()
                    tstate['paused'] = False
            elif self.state == 'Red':
                # checking that state != paused is to make sure that we don't
                # set our paused flag on something that the user has paused previously
                if not tstate['forced'] and torrent.state != 'Paused':
                    torrent.pause()
                    tstate['paused'] = True
                elif tstate['forced']:
                    torrent.resume()
                    tstate['paused'] = False

        self.torrent_states.save()

    def _on_torrent_finished(self, torrent_id):
        if self.config["force_unforce_finished"]:
            try:
                tstate = self.torrent_states[torrent_id]
            except KeyError:
                pass
            else:
                if tstate['forced']:
                    tstate['forced'] = False
                    tstate['paused'] = False
                    self.update_torrent(torrent_id)

    def _cleanup_states(self):
        valid = set(component.get("Core").torrentmanager.get_torrent_list())
        saved = set(self.torrent_states.config.keys())

        self._remove_torrent(saved - valid)

    def _remove_torrent(self, torrent_ids):
        do_save = False

        if not hasattr(torrent_ids, '__iter__'):
            torrent_ids = [torrent_ids]

        for torrent_id in torrent_ids:
            try:
                try:
                    del self.torrent_states[torrent_id]
                except AttributeError:
                    # old config's didn't have a __delitem__
                    # new config's do and do a .save() automatically
                    del self.torrent_states.config[torrent_id]
                    do_save = True
            except KeyError:
                pass

        if do_save:
            self.torrent_states.save()
