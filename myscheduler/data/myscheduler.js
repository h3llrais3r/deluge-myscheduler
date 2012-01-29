Ext.ns('Deluge.ux.preferences'); 

/*
Deluge.ux.preferences.MySchedulerSelectPanel = Ext.extend(Ext.form.FieldSet, {

    title: _('Schedule'), 
    autoHeight: true,
	
	onRender: function(ct, position) {
		Deluge.ux.preferences.MySchedulerSelectPanel.superclass.onRender.call(this, ct, position);
		
		var dom = this.body.dom;
		var table = createEl(dom, 'table');
		
		function createEl(parent, type) {
			var el = document.createElement(type);
			parent.appendChild(el);
			return el;
		}
		
		Ext.each(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], function(day) {
			var row = createEl(table, 'tr');
			var label = createEl(row, 'th');
			label.setAttribute('style', 'font-weight: bold; padding-right: 5px;');
			label.innerHTML = day;
			for (var hour = 0; hour < 24; hour++) {
				var cell = createEl(row, 'td');
				cell.setAttribute('style', 'border: 1px solid Green; width: 16px; height: 20px; background: LightGreen;');
			}
		});
	}
});

Deluge.ux.preferences.MySchedulerPreferences = Ext.extend(Ext.Panel, {
	
    constructor: function (config) { 
        name: "MyScheduler", 
    }, config)
    title: _('MyScheduler'), 
    border: false, 

	initComponent: function() {
		Deluge.ux.preferences.MySchedulerPreferences.superclass.initComponent.call(this);
       
		this.form = this.add({
			xtype: 'form',
			layout: 'form',
			border: false,
			autoHeight: true
		}); 

		this.schedule = this.form.add(new Deluge.ux.preferences.MySchedulerSelectPanel());
		
		this.slowSettings = this.form.add({
			xtype: 'fieldset',
			title: _('Slow Settings'),
			autoHeight: true,
			defaultType: 'spinnerfield'
		});
		
		this.downloadLimit = this.slowSettings.add({
			fieldLabel: _('Download Limit'),
			name: 'download_limit'
		});
		this.uploadLimit = this.slowSettings.add({
			fieldLabel: _('Upload Limit'),
			name: 'upload_limit'
		});
		this.activeTorrents = this.slowSettings.add({
			fieldLabel: _('Active Torrents'),
			name: 'active_torrents'
		});
	},
	
	onRender: function(ct, position) {
		Deluge.ux.preferences.MySchedulerPreferences.superclass.onRender.call(this, ct, position);
		this.form.layout = new Ext.layout.FormLayout();
		this.form.layout.setContainer(this);
		this.form.doLayout();
	},

    onShow: function() {
		Deluge.ux.preferences.MySchedulerPreferences.superclass.onShow.call(this);
	}
});
*/
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

            scope: this,
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

                    scope: this,
                });
            },
        }));

        deluge.menus.torrent.on('show', this.onMenuShow, this); 
    },
});

Deluge.registerPlugin('MyScheduler', Deluge.plugins.MySchedulerPlugin);
