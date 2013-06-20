Ext.ns('Deluge.ux.preferences');

Ext.ns('Deluge.plugins');

Deluge.plugins.MySchedulerPlugin = Ext.extend(Deluge.Plugin, {

    name : 'MyScheduler',
    prefsPage: null,
    menuItem: null,

    onDisable: function() {
		//deluge.preferences.removePage(this.prefsPage);
        deluge.menus.torrent.remove(this.menuItem);

        deluge.menus.torrent.un('beforeshow', this.onMenuShow, this);

        this.prefsPage = null;
        this.menuItem = null;
	},

    onMenuShow: function () {
        var ids = deluge.torrents.getSelectedIds();
        this.menuItem.setChecked(false, true);

        deluge.client.myscheduler.get_forced (ids, {
            success: function (checked) {
                // show true only if every id is forced=true, dumb loop as apparently IE can't handle a .IndexOf
                var res = true;
                for (var i = 0; i < checked.length; i++) {
                    if (!checked[i]) {
                        res = false;
                        break;
                    }
                }

                this.menuItem.setChecked(res, true);
            },

            failure: function () {
                console.warning ("Failed to get forced state");
            },

            scope: this
        });
        return true;
    },

	onEnable: function() {
		//this.prefsPage = deluge.preferences.addPage (new Deluge.ux.preferences.MySchedulerPreferences());

        this.menuItem = deluge.menus.torrent.add(new Ext.menu.CheckItem ({
            text: _('Forced Start'),
            checked: false,

            checkHandler: function (item, checked) {
                var ids = deluge.torrents.getSelectedIds();
                deluge.client.myscheduler.set_forced (ids, checked, {
                    success: function () {
                        console.log ("Successfully set forced = " + checked);
                    },

                    failure: function () {
                        console.warning ("Failed to set forced for " + ids + " to " + checked);
                        this.menuItem.setChecked(false, true);
                    },

                    scope: this
                });
            }
        }));

        deluge.menus.torrent.on('show', this.onMenuShow, this);
    }
});

Deluge.registerPlugin('MyScheduler', Deluge.plugins.MySchedulerPlugin);
