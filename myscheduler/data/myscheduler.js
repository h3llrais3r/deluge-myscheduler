/*
Script: myscheduler.js
    The client-side javascript code for the MyScheduler plugin.

Copyright:
    (C) samuel337 2011
    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 3, or (at your option)
    any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, write to:
        The Free Software Foundation, Inc.,
        51 Franklin Street, Fifth Floor
        Boston, MA  02110-1301, USA.

    In addition, as a special exception, the copyright holders give
    permission to link the code of portions of this program with the OpenSSL
    library.
    You must obey the GNU General Public License in all respects for all of
    the code used other than OpenSSL. If you modify file(s) with this
    exception, you may extend this exception to your version of the file(s),
    but you are not obligated to do so. If you do not wish to do so, delete
    this exception statement from your version. If you delete this exception
    statement from all source files in the program, then also delete it here.
*/

Ext.ns('Deluge.ux');

Deluge.ux.ScheduleSelector = Ext.extend(Ext.form.FieldSet, {

    title: _('Schedule'),
    autoHeight: true,
    style: 'margin-bottom: 0px; padding-bottom: 0px;',
    border: false,

    states: [
        {
            name: 'Normal',
            backgroundColor: 'LightGreen',
            borderColor: 'DarkGreen',
            value: 0
        },
        {
            name: 'Throttled',
            backgroundColor: 'Yellow',
            borderColor: 'Gold',
            value: 1
        },
        {
            name: 'Paused',
            backgroundColor: 'OrangeRed',
            borderColor: 'FireBrick',
            value: 2
        }
    ],
    daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],

    initComponent: function() {
        Deluge.ux.ScheduleSelector.superclass.initComponent.call(this);

        // ExtJS' radiogroup implementation is very broken for styling.
        /*this.stateBrush = this.add({
            xtype: 'radiogroup',
            fieldLabel: _('State Brush'),
            name: 'current_state_brush',
            submitValue: false,
            items: [
                { boxLabel: 'Normal', name: 'current_state_brush', inputValue: 0 },
                { boxLabel: 'Throttled', name: 'current_state_brush', inputValue: 1, checked: true },
                { boxLabel: 'Paused', name: 'current_state_brush', inputValue: 2 },
            ]
        });*/
    },

    onRender: function(ct, position) {
        Deluge.ux.ScheduleSelector.superclass.onRender.call(this, ct, position);

        var dom = this.body.dom;

        function createEl(parent, type) {
            var el = document.createElement(type);
            parent.appendChild(el);
            return el;
        }

        // create state brushes
        // tack a random number to the end to avoid clashes
        this.stateBrushName = 'schedule-state-brush-' + Math.round(Math.random() * 10000);

        var el1 = createEl(dom, 'div');

        var el2 = createEl(el1, 'div');
        this.stateBrush = el2;
        el2.id = this.stateBrushName;

        // for webkit
        var floatAttr = 'float';
        if (el2.style.float == undefined) {
            // for firefox
            if (el2.style.cssFloat != undefined) floatAttr = 'cssFloat';
            // for IE
            if (el2.style.styleFloat != undefined) floatAttr = 'styleFloat';
        }
        el2.style[floatAttr] = 'right';

        for (var i=0; i < this.states.length; i++) {
            var el3 = createEl(el2, 'input');
            el3.type = 'radio';
            el3.value = this.states[i].value;
            el3.name = this.stateBrushName;
            el3.id = this.stateBrushName + '-' + this.states[i].name;

            // isn't the first one
            if (i > 0) el3.style.marginLeft = '7px';

            // assume the first is the default state, so make the 2nd one the default brush
            if (i == 1) el3.checked = true;

            var el4 = createEl(el2, 'label');
            el4.appendChild(document.createTextNode(this.states[i].name));
            el4.htmlFor = el3.id;
            el4.style.backgroundColor = this.states[i].backgroundColor;
            el4.style.borderBottom = '2px solid ' + this.states[i].borderColor;
            el4.style.padding = '2px 3px';
            el4.style.marginLeft = '3px';
        }

        el1.appendChild(document.createTextNode('Select a state brush:'));

        el1.style.marginBottom = '10px';

        // keep the radio buttons separate from the time bars
        createEl(dom, 'div').style.clear = 'both';

        var table = createEl(dom, 'table');
        table.cellSpacing = 0;

        // cache access to cells for easier access later
        this.scheduleCells = { };

        Ext.each(this.daysOfWeek, function(day) {
            var cells = [ ];
            var row = createEl(table, 'tr');
            var label = createEl(row, 'th');
            label.setAttribute('style', 'font-weight: bold; padding-right: 5px;');
            label.appendChild(document.createTextNode(day));
            for (var hour = 0; hour < 24; hour++) {
                var cell = createEl(row, 'td');

                // assume the first state is the default state
                cell.currentValue = cell.oldValue = this.states[0].value;
                cell.day = day;
                cell.hour = hour;

                cell.width = '16px';
                cell.height = '20px';

                cell.style.border = '1px solid #999999';
                // don't repeat borders in between cells
                if (hour != 23) // not the last cell
                    cell.style.borderRight = 'none';

                this.updateCell(cell);

                cells.push(cell);

                cell = Ext.get(cell);
                cell.on('click', this.onCellClick, this);
                cell.on('mouseover', this.onCellMouseOver, this);
                cell.on('mouseout', this.onCellMouseOut, this);
                cell.on('mousedown', this.onCellMouseDown, this);
                cell.on('mouseup', this.onCellMouseUp, this);
            }

            // insert gap row to provide visual separation
            row = createEl(table, 'tr');
            // blank cell to create gap
            createEl(row, 'td').height = '3px';

            this.scheduleCells[day] = cells;
        }, this);
    },

    updateCell: function(cell) {
        // sanity check
        if (cell.currentValue == undefined) return;

        for (var i in this.states) {
            var curState = this.states[i];
            if (curState.value == cell.currentValue) {
                cell.style.background = curState.backgroundColor;
                break;
            }
        }
    },

    getCurrentBrushValue: function() {
        var v = null;
        var brushes = Ext.get(this.body.dom).findParent('form').elements[this.stateBrushName];
        Ext.each(brushes, function(b) {
            if (b.checked)
                v = b.value;
        });

        return v;
    },

    onCellClick: function(event, cell) {
        cell.oldValue = cell.currentValue;

        this.dragAnchor = null;
    },

    onCellMouseDown: function(event, cell) {
        this.dragAnchor = cell;
    },

    onCellMouseUp: function(event, cell) {
        // if we're dragging...
        if (this.dragAnchor) {
            // set all those between here and the anchor to the new values
            if (cell.hour > this.dragAnchor.hour)
                this.confirmCells(cell.day, this.dragAnchor.hour, cell.hour);
            else if (cell.hour < this.dragAnchor.hour)
                this.confirmCells(cell.day, cell.hour, this.dragAnchor.hour);
            else
                this.confirmCells(cell.day, cell.hour, cell.hour);

            this.hideCellLeftTooltip();
            this.hideCellRightTooltip();
            this.dragAnchor = null;
        }
    },

    onCellMouseOver: function(event, cell) {
        // LEFT TOOL TIP
        // if it isn't showing and we're dragging, show it.
        // otherwise if dragging, leave it alone unless we're dragging to the left.
        // if we're not dragging, show it.
        var leftTooltipCell = null;
        if (!this.dragAnchor)
            leftTooltipCell = cell;
        else if ((this.dragAnchor && this.isCellLeftTooltipHidden()) ||
             (this.dragAnchor && this.dragAnchor.hour > cell.hour))
            leftTooltipCell = this.dragAnchor;

        if (leftTooltipCell) {
            var hour = leftTooltipCell.hour;
            var pm = false;

            // convert to 12-hour time
            if (hour >= 12) {
                pm = true;
                if (hour > 12) hour -= 12;
            }
            // change 0 hour to 12am
            else if (hour == 0) {
                hour = 12;
            }
            this.showCellLeftTooltip(hour + ' ' + (pm ? 'pm' : 'am'), leftTooltipCell);
        }

        // RIGHT TOOL TIP
        var rightTooltipCell = null;
        if (this.dragAnchor) {
            if (this.dragAnchor.hour == cell.hour)
                this.hideCellRightTooltip();
            else if (this.dragAnchor.hour > cell.hour && this.isCellRightTooltipHidden())
                rightTooltipCell = this.dragAnchor;
            else // cell.hour > this.dragAnchor.hour
                rightTooltipCell = cell;
        }

        if (rightTooltipCell) {
            var hour = rightTooltipCell.hour;
            var pm = false;

            // convert to 12-hour time
            if (hour >= 12) {
                pm = true;
                if (hour > 12) hour -= 12;
            }
            // change 0 hour to 12am
            else if (hour == 0) {
                hour = 12;
            }
            this.showCellRightTooltip(hour + ' ' + (pm ? 'pm' : 'am'), rightTooltipCell);
        }

        // preview colour change and
        // revert state for all those on the outer side of the drag if dragging
        if (this.dragAnchor) {
            if (cell.day != this.dragAnchor.day) {
                // dragged into another day. Abort! Abort!
                Ext.each(this.daysOfWeek, function(day) {
                    this.revertCells(day, 0, 23);
                }, this);
                this.dragAnchor = null;
                this.hideCellLeftTooltip();
                this.hideCellRightTooltip();
            }
            else if (cell.hour > this.dragAnchor.hour) {
                // dragging right
                this.revertCells(cell.day, cell.hour+1, 23);
                this.previewCells(cell.day, this.dragAnchor.hour, cell.hour);
            }
            else if (cell.hour < this.dragAnchor.hour) {
                // dragging left
                this.revertCells(cell.day, 0, cell.hour-1);
                this.previewCells(cell.day, cell.hour, this.dragAnchor.hour);
            }
            else {
                // back to anchor cell
                // don't know if it is from right or left, so revert all except this
                this.revertCells(cell.day, cell.hour+1, 23);
                this.revertCells(cell.day, 0, cell.hour-1);
            }
        }
        else {
            // not dragging, just preview this cell
            this.previewCells(cell.day, cell.hour, cell.hour);
        }
    },

    onCellMouseOut: function(event, cell) {
        if (!this.dragAnchor)
            this.hideCellLeftTooltip();

        // revert state. If new state has been set, old and new will be equal.
        // if dragging, this will be handled by the next mouse over
        if (this.dragAnchor == null && cell.oldValue != cell.currentValue) {
            this.revertCells(cell.day, cell.hour, cell.hour);
        }
    },

    previewCells: function(day, fromHour, toHour) {
        var cells = this.scheduleCells[day];
        var curBrushValue = this.getCurrentBrushValue();

        if (toHour > cells.length) toHour = cells.length;

        for (var i=fromHour; i <= toHour; i++) {
            if (cells[i].currentValue != curBrushValue) {
                cells[i].oldValue = cells[i].currentValue;
                cells[i].currentValue = curBrushValue;
                this.updateCell(cells[i]);
            }
        }
    },

    revertCells: function(day, fromHour, toHour) {
        var cells = this.scheduleCells[day];

        if (toHour > cells.length) toHour = cells.length;

        for (var i=fromHour; i <= toHour; i++) {
            cells[i].currentValue = cells[i].oldValue;
            this.updateCell(cells[i]);
        }
    },

    confirmCells: function(day, fromHour, toHour) {
        var cells = this.scheduleCells[day];

        if (toHour > cells.length) toHour = cells.length;

        for (var i=fromHour; i <= toHour; i++) {
            if (cells[i].currentValue != cells[i].oldValue) {
                cells[i].oldValue = cells[i].currentValue;
            }
        }
    },

    showCellLeftTooltip: function(text, cell) {
        var tooltip = this.cellLeftTooltip;

        if (!tooltip) {
            // no cached left tooltip exists, create one
            tooltip = document.createElement('div');
            this.cellLeftTooltip = tooltip;
            this.body.dom.appendChild(tooltip);
            tooltip.style.position = 'absolute';
            tooltip.style.backgroundColor = '#F2F2F2';
            tooltip.style.border = '1px solid #333333';
            tooltip.style.padding = '1px 3px';
            tooltip.style.opacity = 0.8;
        }

        // remove all existing children
        while (tooltip.childNodes.length > 0) {
            tooltip.removeChild(tooltip.firstChild);
        }
        // add the requested text
        tooltip.appendChild(document.createTextNode(text));

        // place the tooltip
        Ext.get(tooltip).alignTo(cell, 'br-tr');

        // make it visible
        tooltip.style.visibility = 'visible';
    },

    hideCellLeftTooltip: function() {
        if (this.cellLeftTooltip) {
            this.cellLeftTooltip.style.visibility = 'hidden';
        }
    },

    isCellLeftTooltipHidden: function() {
        if (this.cellLeftTooltip)
            return this.cellLeftTooltip.style.visibility == 'hidden';
        else
            return true;
    },

    showCellRightTooltip: function(text, cell) {
        var tooltip = this.cellRightTooltip;

        if (!tooltip) {
            // no cached left tooltip exists, create one
            tooltip = document.createElement('div');
            this.cellRightTooltip = tooltip;
            this.body.dom.appendChild(tooltip);
            tooltip.style.position = 'absolute';
            tooltip.style.backgroundColor = '#F2F2F2';
            tooltip.style.border = '1px solid #333333';
            tooltip.style.padding = '1px 3px';
            tooltip.style.opacity = 0.8;
        }

        // remove all existing children
        while (tooltip.childNodes.length > 0) {
            tooltip.removeChild(tooltip.firstChild);
        }
        // add the requested text
        tooltip.appendChild(document.createTextNode(text));

        // place the tooltip
        Ext.get(tooltip).alignTo(cell, 'bl-tl');

        // make it visible
        tooltip.style.visibility = 'visible';
    },

    hideCellRightTooltip: function() {
        if (this.cellRightTooltip) {
            this.cellRightTooltip.style.visibility = 'hidden';
        }
    },

    isCellRightTooltipHidden: function() {
        if (this.cellRightTooltip)
            return this.cellRightTooltip.style.visibility == 'hidden';
        else
            return true;
    },

    getConfig: function() {
        var config = [ ];

        for (var i=0; i < 24; i++) {
            var hourConfig = [ 0, 0, 0, 0, 0, 0, 0 ];

            for (var j=0; j < this.daysOfWeek.length; j++) {
                hourConfig[j] = parseInt(this.scheduleCells[this.daysOfWeek[j]][i].currentValue);
            }

            config.push(hourConfig);
        }

        return config;
    },

    setConfig: function(config) {
        for (var i=0; i < 24; i++) {
            var hourConfig = config[i];

            for (var j=0; j < this.daysOfWeek.length; j++) {
                if (this.scheduleCells == undefined) {
                    var cell = hourConfig[j];
                } else {
                    var cell = this.scheduleCells[this.daysOfWeek[j]][i];
                }
                cell.currentValue = cell.oldValue = hourConfig[j];
                this.updateCell(cell);
            }
        }
    }
});

Ext.ns('Deluge.ux.preferences');

Deluge.ux.preferences.MySchedulerPage = Ext.extend(Ext.Panel, {

    border: false,
    title: _('MyScheduler'),
    layout: 'form',
    autoScroll: true,

    initComponent: function() {
        Deluge.ux.preferences.MySchedulerPage.superclass.initComponent.call(this);

        this.form = this.add({
            xtype: 'form',
            layout: 'form',
            border: false,
            autoHeight: true
        });

        this.schedule = this.form.add(new Deluge.ux.ScheduleSelector());

        this.ignoreSettings = this.form.add({
            xtype: 'fieldset',
            border: false,
            title: _('Scheduler Override'),
            autoHeight: true,
            defaultType: 'checkbox',
            labelWidth: 80
        });

        this.forcedSettings = this.form.add({
            xtype: 'fieldset',
            border: false,
            title: _('Forced Settings'),
            autoHeight: true,
            defaultType: 'checkbox',
            labelWidth: 80
        });

        this.chkIgnoreScheduler = this.ignoreSettings.add({
            xtype: 'checkbox',
            name: 'chkIgnoreScheduler',
            height: 22,
            hideLabel: true,
            boxLabel: _('Ignore Scheduler')
        });

        this.chkIndividual = this.forcedSettings.add({
            xtype: 'checkbox',
            name: 'chkIndividual',
            height: 22,
            hideLabel: true,
            boxLabel: _('Use Individual Scheduling')
        });

        this.chkUnforceFinished = this.forcedSettings.add({
            xtype: 'checkbox',
            name: 'chkUnforceFinished',
            height: 22,
            hideLabel: true,
            boxLabel: _('Un-Force on Finished')
        });

        this.slowSettings = this.form.add({
            xtype: 'fieldset',
            border: false,
            title: _('Throttled Settings'),
            autoHeight: true,
            defaultType: 'spinnerfield',
            defaults: {
                minValue: -1,
                maxValue: 99999
            },
            style: 'margin-top: 5px; margin-bottom: 0px; padding-bottom: 0px;',
            labelWidth: 200
        });

        this.downloadLimit = this.slowSettings.add({
            fieldLabel: _('Maximum Download Speed (KiB/s)'),
            name: 'download_limit',
            width: 80,
            value: -1,
            decimalPrecision: 0
        });
        this.uploadLimit = this.slowSettings.add({
            fieldLabel: _('Maximum Upload Speed (KiB/s)'),
            name: 'upload_limit',
            width: 80,
            value: -1,
            decimalPrecision: 0
        });
        this.activeTorrents = this.slowSettings.add({
            fieldLabel: _('Active Torrents'),
            name: 'active_torrents',
            width: 80,
            value: -1,
            decimalPrecision: 0
        });
        this.activeDownloading = this.slowSettings.add({
            fieldLabel: _('Active Downloading'),
            name: 'active_downloading',
            width: 80,
            value: -1,
            decimalPrecision: 0
        });
        this.activeSeeding = this.slowSettings.add({
            fieldLabel: _('Active Seeding'),
            name: 'active_seeding',
            width: 80,
            value: -1,
            decimalPrecision: 0
        });

        this.on('show', this.updateConfig, this);
    },

    onRender: function(ct, position) {
        Deluge.ux.preferences.MySchedulerPage.superclass.onRender.call(this, ct, position);
        this.form.layout = new Ext.layout.FormLayout();
        this.form.layout.setContainer(this);
        this.form.doLayout();
    },

    onApply: function() {
        // build settings object
        var config = { }

        config['button_state'] = this.schedule.getConfig();
        config['low_down'] = this.downloadLimit.getValue();
        config['low_up'] = this.uploadLimit.getValue();
        config['low_active'] = this.activeTorrents.getValue();
        config['low_active_down'] = this.activeDownloading.getValue();
        config['low_active_up'] = this.activeSeeding.getValue();
        config["force_use_individual"] = this.chkIndividual.getValue();
        config["force_unforce_finished"] = this.chkUnforceFinished.getValue();
        config["ignore_scheduler"] = this.chkIgnoreScheduler.getValue();

        deluge.client.myscheduler.set_config(config);
    },

    onOk: function() {
        this.onApply();
    },

    afterRender: function() {
        Deluge.ux.preferences.MySchedulerPage.superclass.afterRender.call(this);
        this.updateConfig();
    },

    updateConfig: function() {
        deluge.client.myscheduler.get_config({
            success: function(config) {
                this.schedule.setConfig(config['button_state']);
                this.downloadLimit.setValue(config['low_down']);
                this.uploadLimit.setValue(config['low_up']);
                this.activeTorrents.setValue(config['low_active']);
                this.activeDownloading.setValue(config['low_active_down']);
                this.activeSeeding.setValue(config['low_active_up']);
                this.chkIndividual.setValue(config["force_use_individual"]);
                this.chkUnforceFinished.setValue(config["force_unforce_finished"]);
                this.chkIgnoreScheduler.setValue(config["ignore_scheduler"])
            },
            scope: this
        });
    }
});

Ext.ns('Deluge.plugins');

Deluge.plugins.MySchedulerPlugin = Ext.extend(Deluge.Plugin, {

    name : 'MyScheduler',
    prefsPage: null,
    menuItem: null,
    optionsTab: null,
    optionsTabForceStartItem: null,

    onMenuShow: function () {
        // clear checkbox by default
        this.menuItem.setChecked(false, true);

        // load checkbox value
        var ids = deluge.torrents.getSelectedIds();
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
                console.warning ("Failed to get forced state for " + ids);
            },
            scope: this
        });
    },

    onMenuHide: function() {
        // sync forced state to options tab
        this.syncForcedStateToOptionsTab();
    },

    onTorrentsRowClick: function () {
        // sync forced state to options tab
        this.syncForcedStateToOptionsTab();
    },

    syncForcedStateToOptionsTab: function() {
        // sync forced state to options tab
        var ids = deluge.torrents.getSelectedIds();
        if (ids.length > 0) {
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
                    // set option
                    deluge.details.get(4).optionsManager.set('force_start', res);
                },
                failure: function () {
                    console.warning ("Failed to get forced state for " + ids);
                },
                scope: this
            });
        } else {
            // clear option when nothing is selected
            deluge.details.get(4).optionsManager.set('force_start', false);
        }
    },

    onForceStartCheckedInMenu: function (item, checked) {
        // handle checkbox selection in menu
        var ids = deluge.torrents.getSelectedIds();
        deluge.client.myscheduler.set_forced (ids, checked, {
            success: function () {
                console.log ("Setting forced state = " + checked + " for " + ids);
            },
            failure: function () {
                console.warning ("Failed to set forced state = " + checked + " for " + ids);
                this.menuItem.setChecked(false, true);
            },
            scope: this
        });
    },

    onForceStartClickInOptions: function(event, checkbox) {
        // handle checkbox click actions in options tab
        // only handle the 'click' event and skip others like 'change'
        if(event.type == 'click') {
            var ids = deluge.torrents.getSelectedIds();
            deluge.client.myscheduler.set_forced (ids, checkbox.checked, {
                success: function () {
                    console.log ("Setting forced state = " + checkbox.checked + " for " + ids);
                },
                failure: function () {
                    console.warning ("Failed to set forced state = " + checkbox.checked + " for " + ids);
                },
                scope: this
            });
        }
    },

	onEnable: function() {
        // load prefs page
		this.prefsPage = deluge.preferences.addPage (new Deluge.ux.preferences.MySchedulerPage());

        // load menu - insert at position 3 (after pause and resume)
        this.menuItem = deluge.menus.torrent.insert(2, new Ext.menu.CheckItem ({
            text: _('Force Start'),
            checked: false,
            checkHandler: this.onForceStartCheckedInMenu
        }));

        // load option - insert in the details options tab, general fieldset
        this.optionsTab = deluge.details.get(4);
        this.optionsTabForceStartItem = this.optionsTab.fieldsets.general.add({
			fieldLabel: '',
			labelSeparator: '',
			boxLabel: 'Force start',
			id: 'force_start',
            handler: null // we can set a handler here also, but we use the onClick for now
		});

        // only bind to click event because we only want to handle real checkbox click events here!
        this.optionsTabForceStartItem.onClick = this.onForceStartClickInOptions;

        // bind the field so the options manager can manage it
        this.optionsTab.optionsManager.bind('force_start', this.optionsTabForceStartItem);

        // bind events
        deluge.menus.torrent.on('show', this.onMenuShow, this, {stopEvent : true});
        deluge.menus.torrent.on('hide', this.onMenuHide, this, {stopEvent : true});
        deluge.torrents.on('rowclick', this.onTorrentsRowClick, this, {stopEvent : true});
    },

    onDisable: function() {
		deluge.preferences.removePage(this.prefsPage);
        deluge.menus.torrent.remove(this.menuItem);
        deluge.details.get(4).fieldsets.general.remove(this.optionsTabForceStartItem);

        deluge.menus.torrent.un('show', this.onMenuShow, this);
        deluge.menus.torrent.un('hide', this.onMenuHide, this);
        deluge.torrents.un('rowclick', this.onTorrentsRowClick, this);

        this.prefsPage = null;
        this.menuItem = null;
        this.optionsTab = null;
        this.optionsTabForceStartItem = null;
	}
});

Deluge.registerPlugin('MyScheduler', Deluge.plugins.MySchedulerPlugin);
