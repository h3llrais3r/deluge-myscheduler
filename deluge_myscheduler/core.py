# -*- coding: utf-8 -*-
#
# Copyright (C) 2009 Andrew Resch <andrewresch@gmail.com>
#
# Basic plugin template created by:
# Copyright (C) 2008 Martijn Voncken <mvoncken@gmail.com>
# Copyright (C) 2007-2009 Andrew Resch <andrewresch@gmail.com>
#
# This file is part of Deluge and is licensed under GNU General Public License 3.0, or later, with
# the additional special exception to link portions of this program with the OpenSSL library.
# See LICENSE for more details.
#

from __future__ import unicode_literals

import logging
import time

from twisted.internet import reactor

import deluge.component as component
import deluge.configmanager
from deluge.core.rpcserver import export
from deluge.event import DelugeEvent, SessionResumedEvent
from deluge.plugins.pluginbase import CorePluginBase

log = logging.getLogger(__name__)

DEFAULT_PREFS = {
    'low_down': -1.0,
    'low_up': -1.0,
    'low_active': -1,
    'low_active_down': -1,
    'low_active_up': -1,
    'button_state': [[0] * 7 for dummy in range(24)],
    'ignore_schedule': False,
    'force_use_individual': True,
    'force_unforce_finished': True
}

DEFAULT_STATES = {}

STATES = {0: 'Green', 1: 'Yellow', 2: 'Red'}

CONTROLLED_SETTINGS = [
    'max_download_speed',
    'max_upload_speed',
    'max_active_limit',
    'max_active_downloading',
    'max_active_seeding',
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
        core_config = component.get('Core').config
        DEFAULT_PREFS['low_down'] = core_config['max_download_speed']
        DEFAULT_PREFS['low_up'] = core_config['max_upload_speed']
        DEFAULT_PREFS['low_active'] = core_config['max_active_limit']
        DEFAULT_PREFS['low_active_down'] = core_config['max_active_downloading']
        DEFAULT_PREFS['low_active_up'] = core_config['max_active_seeding']

        self.config = deluge.configmanager.ConfigManager(
            'myscheduler.conf', DEFAULT_PREFS
        )

        self.torrent_states = deluge.configmanager.ConfigManager(
            'myschedulerstates.conf', DEFAULT_STATES
        )

        self._cleanup_states()

        self.state = self.get_state()

        # Apply the scheduling rules
        self.do_schedule(False)

        # Schedule the next do_schedule() call for on the next hour
        now = time.localtime(time.time())
        secs_to_next_hour = ((60 - now[4]) * 60) + (60 - now[5])
        log.debug('Next schedule check in %s seconds' % secs_to_next_hour)
        self.timer = reactor.callLater(secs_to_next_hour, self.do_schedule)

        # Register torrent state change events
        component.get('EventManager').register_event_handler(
            'TorrentAddedEvent', self._on_torrent_added
        )
        component.get('EventManager').register_event_handler(
            'TorrentResumedEvent', self._on_torrent_resumed
        )
        component.get('EventManager').register_event_handler(
            'TorrentRemovedEvent', self._on_torrent_removed
        )
        component.get('EventManager').register_event_handler(
            'TorrentFinishedEvent', self._on_torrent_finished
        )

        # Register for config changes so state isn't overridden
        component.get('EventManager').register_event_handler(
            'ConfigValueChangedEvent', self.on_config_value_changed
        )

    def disable(self):
        if self.timer.active():
            self.timer.cancel()

        # Deregister torrent state change events
        component.get('EventManager').deregister_event_handler(
            'TorrentAddedEvent', self._on_torrent_added
        )
        component.get('EventManager').deregister_event_handler(
            'TorrentResumedEvent', self._on_torrent_resumed
        )
        component.get('EventManager').deregister_event_handler(
            'TorrentRemovedEvent', self._on_torrent_removed
        )
        component.get('EventManager').deregister_event_handler(
            'TorrentFinishedEvent', self._on_torrent_finished
        )

        component.get('EventManager').deregister_event_handler(
            'ConfigValueChangedEvent', self.on_config_value_changed
        )

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
        core_config = deluge.configmanager.ConfigManager('core.conf')
        for setting in CONTROLLED_SETTINGS:
            component.get('PreferencesManager').do_config_set_func(
                setting, core_config[setting]
            )
        # Resume the session if necessary
        # component.get('Core').resume_session()
        self._resume_all_torrents()

    def do_schedule(self, timer=True):
        """
        This is where we apply schedule rules.
        """

        state = self.get_state()
        self._update_torrents()

        if state == 'Green':
            # This is Green (Normal) so we just make sure we've applied the
            # global defaults
            self.__apply_set_functions()
        elif state == 'Yellow':
            # This is Yellow (Slow), so use the settings provided from the user
            settings = {
                'active_limit': self.config['low_active'],
                'active_downloads': self.config['low_active_down'],
                'active_seeds': self.config['low_active_up'],
                'download_rate_limit': int(self.config['low_down'] * 1024),
                'upload_rate_limit': int(self.config['low_up'] * 1024),
            }
            component.get('Core').apply_session_settings(settings)
            # Resume the session if necessary
            # component.get('Core').resume_session()
            self._resume_all_torrents()
        elif state == 'Red':
            # This is Red (Stop), so pause the libtorrent session
            # component.get('Core').pause_session()
            self._pause_all_torrents()

        if state != self.state:
            # The state has changed since last update so we need to emit an event
            self.state = state
            component.get('EventManager').emit(SchedulerEvent(self.state))

        # Called after self.state is set
        if self.config['force_use_individual'] and (state == 'Green' or state == 'Red'):
            self._update_torrents()

        if timer:
            # Call this again in 1 hour
            log.debug('Next schedule check in 3600 seconds')
            self.timer = reactor.callLater(3600, self.do_schedule)

    @export()
    def set_config(self, config):
        """Sets the config dictionary."""
        for key in config:
            self.config[key] = config[key]
        self.config.save()
        self.do_schedule(False)

    @export()
    def get_config(self):
        """Returns the config dictionary."""
        return self.config.config

    @export()
    def get_state(self):
        # Return 'green' state when schedule is ignored
        if self.config['ignore_schedule']:
            return STATES[0]

        # Get state from schedule
        now = time.localtime(time.time())
        level = self.config['button_state'][now[3]][now[6]]
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

        return [f(t) for t in torrent_ids]

    @export()
    def set_forced(self, torrent_ids, forced=True):
        log.debug('Setting torrent %s to forced=%s' % (torrent_ids, forced))

        if not hasattr(torrent_ids, '__iter__'):
            torrent_ids = [torrent_ids]

        for t in torrent_ids:
            self.torrent_states[t]['forced'] = forced

        self._update_torrents(torrent_ids)

    def _pause_all_torrents(self):
        """
        Pause all torrents in the session.
        Fix for https://github.com/h3llrais3r/deluge-myscheduler/issues/4
        """
        for torrent in component.get('Core').torrentmanager.torrents.values():
            torrent.pause()

    def _resume_all_torrents(self):
        """
        Resume all torrents in the session.
        Fix for https://github.com/h3llrais3r/deluge-myscheduler/issues/4
        """
        for torrent in component.get('Core').torrentmanager.torrents.values():
            torrent.resume()
        component.get('EventManager').emit(SessionResumedEvent())

    def _update_torrents(self, torrent_ids=None):
        if not self.config['force_use_individual']:
            return

        if not torrent_ids:
            torrent_ids = component.get('Core').torrentmanager.get_torrent_list()
        elif not hasattr(torrent_ids, '__iter__'):
            torrent_ids = [torrent_ids]

        for torrent_id in torrent_ids:
            self._update_torrent(torrent_id, save_state=False)

        # Save all states at once
        self.torrent_states.save()

    def _update_torrent(self, torrent_id, save_state=True):
        if not self.config['force_use_individual']:
            return

        torrent = component.get('Core').torrentmanager.torrents[torrent_id]
        try:
            tstate = self.torrent_states[torrent_id]
        except KeyError:
            tstate = {'forced': False, 'paused': False}
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

        if save_state:
            self.torrent_states.save()

    def _on_torrent_added(self, torrent_id, from_state):
        self._update_torrent(torrent_id)

    def _on_torrent_resumed(self, torrent_id):
        self._update_torrent(torrent_id)

    def _on_torrent_removed(self, torrent_id):
        self._update_torrent(torrent_id)

    def _on_torrent_finished(self, torrent_id):
        if self.config['force_unforce_finished']:
            try:
                tstate = self.torrent_states[torrent_id]
            except KeyError:
                pass
            else:
                if tstate['forced']:
                    tstate['forced'] = False
                    tstate['paused'] = False
                    self._update_torrent(torrent_id)

    def _cleanup_states(self):
        valid = set(component.get('Core').torrentmanager.get_torrent_list())
        saved = set(list(self.torrent_states.config))

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
